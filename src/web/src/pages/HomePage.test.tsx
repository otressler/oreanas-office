import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampaignSummary } from '../api/types'
import { ids, smallBoard } from '../encounters/testing'
import { rememberUser } from '../offline/identity'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../encounters/FakeBoard')).FakeBoard,
}))

function campaign(id: string, fight: { id: string; name: string } | null): CampaignSummary {
  return {
    id,
    name: `Kampagne ${id}`,
    myRole: 'player',
    activeSession: {
      id: `s-${id}`,
      title: 'Sitzung 1',
      date: '2026-10-12',
      dmUserId: 'dm',
      dmDisplayName: 'Oreana',
      activeEncounter: fight,
    },
  }
}

/** A device this user signed in on before, so home opens their campaigns. */
function api(campaigns: CampaignSummary[]) {
  rememberUser(testUser)
  mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns': () => json(200, campaigns),
    'GET /api/campaigns/:id/encounters/:eid/board': () =>
      json(200, smallBoard({ status: 'active', sessionId: ids.session })),
  })
}

const fight = { id: ids.encounter, name: 'Kleine Lichtung' }

afterEach(() => sessionStorage.clear())

describe('HomePage', () => {
  it('goes straight to the one running fight, once per tab', async () => {
    api([campaign(ids.campaign, fight), campaign('other', null)])
    const { router } = renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Kleine Lichtung' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/kampagnen/${ids.campaign}/kampf/${ids.encounter}`)

    // Back on the landing page, it stays there and links to the fight.
    await router.navigate(-1)
    expect(await screen.findByRole('heading', { name: de.home.title })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('link', { name: de.encounters.toFight })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`,
    )
  })

  it('stays on the landing page when two fights run', async () => {
    api([campaign('a', { id: 'e-a', name: 'A' }), campaign('b', { id: 'e-b', name: 'B' })])
    const { router } = renderApp('/')

    expect(await screen.findAllByRole('link', { name: de.encounters.toFight })).toHaveLength(2)
    expect(router.state.location.pathname).toBe('/')
  })
})
