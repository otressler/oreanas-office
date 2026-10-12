import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Campaign, Encounter, Session } from '../api/types'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { encounter, ids, session } from './testing'

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
