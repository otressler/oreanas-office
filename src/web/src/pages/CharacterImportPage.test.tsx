import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Campaign, Character, ImportableCharacter } from '../api/types'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

const t = de.characters
const i = t.import
const CAMPAIGN = 'c1'

const campaign: Campaign = {
  id: CAMPAIGN,
  name: 'Die Rabenküste',
  defaultDmUserId: 'u-dm',
  myRole: 'player',
  joinCode: null,
  activeSessionId: null,
  members: [],
  description: null,
  coverUrl: null,
}

function importable(fields: Partial<ImportableCharacter> = {}): ImportableCharacter {
  return {
    id: 'src1',
    campaignId: 'c2',
    campaignName: 'Der Fluch von Barovia',
    name: 'Thorin',
    size: 'small',
    tagline: 'Hat immer Hunger.',
    characterClass: 'Kämpfer',
    species: 'Zwerg',
    color: null,
    portraitUrl: null,
    ...fields,
  }
}

function character(fields: Partial<Character> = {}): Character {
  return {
    id: 'ch1',
    ownerUserId: testUser.id,
    ownerDisplayName: testUser.displayName,
    name: 'Liriel',
    size: 'medium',
    canEdit: true,
    colorIndex: 0,
    tagline: '',
    characterClass: '',
    species: '',
    age: '',
    appearance: '',
    background: '',
    personality: '',
    bonds: '',
    portraitUrl: null,
    color: null,
    ...fields,
  }
}

function api(here: Character[], others: ImportableCharacter[]) {
  const characters = [...here]
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id': json(200, campaign),
    'GET /api/campaigns/:id/characters': () => json(200, characters),
    'GET /api/campaigns/:id/characters/importable': () => json(200, others),
    'GET /api/campaigns/:id/sessions': () => json(200, []),
    'POST /api/campaigns/:id/characters/import': (call) => {
      const source = others.find(
        (other) => other.id === (call.body as { characterId: string }).characterId,
      )!
      const copy = character({
        id: 'copy1',
        name: source.name,
        size: source.size,
        colorIndex: characters.length,
      })
      characters.push(copy)
      return json(201, copy)
    },
  })
  return calls
}

describe('CharacterImportPage', () => {
  it('shows the viewer’s other characters by campaign and copies one on its button', async () => {
    const user = userEvent.setup()
    const calls = api(
      [character({ name: 'Thorin' })],
      [
        importable(),
        importable({ id: 'src2', name: 'Brom', campaignId: 'c3', campaignName: 'Die Gruft' }),
      ],
    )
    const { router } = renderApp(`/kampagnen/${CAMPAIGN}/charaktere/uebernehmen`)

    expect(await screen.findByRole('heading', { name: i.title, level: 1 })).toBeInTheDocument()
    const barovia = screen.getByRole('region', { name: 'Der Fluch von Barovia' })
    expect(within(barovia).getByText('Zwerg · Kämpfer')).toBeInTheDocument()
    // A character of the same name is already the viewer's here.
    expect(within(barovia).getByText(i.alreadyHere)).toBeInTheDocument()
    const gruft = screen.getByRole('region', { name: 'Die Gruft' })
    expect(within(gruft).queryByText(i.alreadyHere)).not.toBeInTheDocument()
    // The card itself is no link: only its button imports.
    expect(within(barovia).queryByRole('link')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: i.buttonLabel('Brom') }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/kampagnen/${CAMPAIGN}/charaktere/copy1`),
    )
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ characterId: 'src2' })
    expect(await screen.findByRole('heading', { name: 'Brom', level: 1 })).toBeInTheDocument()
  })

  it('says when there is nothing to take', async () => {
    api([], [])
    renderApp(`/kampagnen/${CAMPAIGN}/charaktere/uebernehmen`)
    expect(await screen.findByText(i.empty)).toBeInTheDocument()
  })

  it('offers the tile on the campaign page only to someone with characters elsewhere', async () => {
    api([], [importable()])
    renderApp(`/kampagnen/${CAMPAIGN}`)
    expect(await screen.findByRole('link', { name: new RegExp(i.title) })).toHaveAttribute(
      'href',
      `/kampagnen/${CAMPAIGN}/charaktere/uebernehmen`,
    )
  })

  it('has no tile without characters elsewhere', async () => {
    api([], [])
    renderApp(`/kampagnen/${CAMPAIGN}`)
    await screen.findByRole('link', { name: new RegExp(t.add) })
    expect(screen.queryByRole('link', { name: new RegExp(i.title) })).not.toBeInTheDocument()
  })
})
