import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Campaign, Encounter, Session } from '../api/types'
import { offlineDb } from '../offline/db'
import { syncBeforeStart } from '../sync/client'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { encounter, ids, session } from './testing'

vi.mock('../sync/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/client')>()),
  syncBeforeStart: vi.fn(),
}))

function campaign(myRole: Campaign['myRole']): Campaign {
  return {
    id: ids.campaign,
    name: 'Die Rabenküste',
    defaultDmUserId: testUser.id,
    myRole,
    joinCode: myRole === 'dm' ? 'KX7PQ2' : null,
    activeSessionId: ids.session,
    members: [],
  }
}

function api(myRole: Campaign['myRole'], sessions: Session[], encounters: Encounter[], extra = {}) {
  return mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id': () => json(200, campaign(myRole)),
    'GET /api/campaigns/:id/characters': () => json(200, []),
    'GET /api/campaigns/:id/sessions': () => json(200, sessions),
    'GET /api/campaigns/:id/encounters': () => json(200, encounters),
    ...extra,
  })
}

const panel = () => screen.findByRole('region', { name: de.encounters.title })

describe('EncountersPanel', () => {
  it('lists the fights with status, size and creatures, and offers setup to the session DM', async () => {
    api('dm', [session()], [encounter({ creatureCount: 4, width: 20, height: 12 })])
    renderApp(`/kampagnen/${ids.campaign}`)

    const encounters = await panel()
    expect(await within(encounters).findByText('Kleine Lichtung')).toBeInTheDocument()
    expect(encounters).toHaveTextContent(de.encounterStatus.ready)
    expect(encounters).toHaveTextContent('20 × 12 Felder (30 m × 18 m) · 4 Kreaturen')
    expect(within(encounters).getByRole('link', { name: de.encounters.setUp })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/sitzungen/${ids.session}/kampf/${ids.encounter}/aufstellen`,
    )
    expect(within(encounters).getByRole('link', { name: de.encounters.importMap })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/karten/importieren`,
    )
  })

  it('syncs an encounter prepared on this device before the setup, and stays if that is blocked', async () => {
    api('dm', [session()], [encounter()])
    await offlineDb(testUser.id).encounters.put({
      id: ids.encounter,
      campaignId: ids.campaign,
      battleMapId: 'map-1',
      name: 'Kleine Lichtung',
      status: 'ready',
      archivedAt: null,
      tokens: [],
      sessionId: null,
      mapCopy: null,
      createdAt: '2026-10-14T10:00:00Z',
      updatedAt: '2026-10-14T10:00:00Z',
      sync: { baseVersion: 1, changed: false, editCount: 0, issue: null, server: null },
      recordVersion: 1,
    })
    vi.mocked(syncBeforeStart).mockResolvedValueOnce('blocked').mockResolvedValueOnce('offline')
    const { router } = renderApp(`/kampagnen/${ids.campaign}`)
    const user = userEvent.setup()

    const encounters = await panel()
    await user.click(await within(encounters).findByRole('link', { name: de.encounters.setUp }))
    expect(await within(encounters).findByText(de.encounterEditor.startBlocked)).toBeInTheDocument()
    await user.click(within(encounters).getByRole('link', { name: de.encounters.setUp }))
    expect(await within(encounters).findByText(de.encounterEditor.startOffline)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}`)

    vi.mocked(syncBeforeStart).mockResolvedValueOnce('ready')
    await user.click(within(encounters).getByRole('link', { name: de.encounters.setUp }))
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/kampagnen/${ids.campaign}/sitzungen/${ids.session}/kampf/${ids.encounter}/aufstellen`,
      ),
    )
  })

  it('explains why another DM cannot start a ready fight', async () => {
    api('dm', [session({ isSessionDm: false })], [encounter()])
    renderApp(`/kampagnen/${ids.campaign}`)

    const encounters = await panel()
    expect(await within(encounters).findByText(de.encounters.needsSession)).toBeInTheDocument()
    expect(within(encounters).queryByRole('link', { name: de.encounters.setUp })).toBeNull()
  })

  it('is hidden from players', async () => {
    const calls = api('player', [session({ isSessionDm: false })], [])
    renderApp(`/kampagnen/${ids.campaign}`)

    expect(await screen.findByRole('heading', { name: 'Die Rabenküste' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: de.encounters.title })).toBeNull()
    expect(calls.some((c) => c.path.endsWith('/encounters'))).toBe(false)
  })

  it('shows the running fight in the session list, where its DM can end it', async () => {
    const running = { id: ids.encounter, name: 'Kleine Lichtung' }
    const calls = api(
      'dm',
      [session({ activeEncounter: running })],
      [encounter({ status: 'active', sessionId: ids.session })],
      {
        'POST /api/campaigns/:id/sessions/:sid/encounters/:eid/end': () =>
          json(200, encounter({ status: 'ended' })),
      },
    )
    renderApp(`/kampagnen/${ids.campaign}`)
    const user = userEvent.setup()

    const sessions = await screen.findByRole('region', { name: de.sessions.title })
    expect(await within(sessions).findByText(de.encounters.running)).toBeInTheDocument()
    expect(within(sessions).getByRole('link', { name: de.encounters.toFight })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`,
    )
    await user.click(within(sessions).getByRole('button', { name: de.encounters.end }))
    await user.click(within(sessions).getByRole('button', { name: de.encounters.endConfirm }))

    await vi.waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/end'))).toBe(true),
    )
  })
})
