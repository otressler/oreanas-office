import { screen, within } from '@testing-library/react'
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
    description: null,
    coverUrl: null,
    characters: [],
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

  it('shows a card with the cover, description and characters, the own ones first', async () => {
    const names = ['Thorin', 'Mira', 'Kel', 'Ada', 'Bo', 'Cid', 'Dun', 'Eli']
    api([
      {
        ...campaign('c', null),
        activeSession: null,
        description: 'Nebel über dem Tal.',
        coverUrl: '/api/assets/cover',
        characters: names.map((name, i) => ({
          id: `ch-${i}`,
          name,
          colorIndex: i,
          color: null,
          portraitUrl: null,
          mine: i === 0,
        })),
      },
    ])
    renderApp('/')

    const title = await screen.findByRole('link', { name: 'Kampagne c' })
    const card = title.closest('article')!
    expect(within(card).getByText('Nebel über dem Tal.')).toBeInTheDocument()
    expect(card.querySelector('img')).toHaveAttribute('src', '/api/assets/cover')
    const list = within(card).getByRole('list', { name: de.home.characters })
    // Six characters, then "+2" for the rest.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'TThorin',
      'MMira',
      'KKel',
      'AAda',
      'BBo',
      'CCid',
      `${de.home.moreCharacters(2)}${de.home.moreCharactersLabel(2)}`,
    ])
    // Joining and creating sit side by side below.
    expect(screen.getByRole('region', { name: de.home.joinTitle })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: de.home.createTitle })).toBeInTheDocument()
  })

  it('shows the default cover without a picked one', async () => {
    api([{ ...campaign('c', null), activeSession: null }])
    renderApp('/')

    const card = (await screen.findByRole('link', { name: 'Kampagne c' })).closest('article')!
    expect(card.querySelector('img')).toHaveAttribute('src', '/home/cover-default-1536.webp')
    expect(within(card).getByText(de.home.noCharacters)).toBeInTheDocument()
  })
})
