import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, Character } from '../api/types'
import { fakeImages } from '../editor/background/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'
import { tokenImage, tokenImagesOf } from '../tokenImages/testing'

// The factory must not import the fake hub's module: that pulls in the app's routes, which
// import the page again and would wait on themselves.
const imageHub = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('../tokenImages/createConnection', () => ({
  createTokenImageConnection: () => imageHub.factory!(),
}))

const t = de.characters
const p = t.page
const CAMPAIGN = 'c1'

beforeEach(() => {
  imageHub.factory = fakeImages.hub.factory
  fakeImages.hub.reset()
})

function campaign(myRole: Campaign['myRole'] = 'player'): Campaign {
  return {
    id: CAMPAIGN,
    name: 'Die Rabenküste',
    defaultDmUserId: 'u-dm',
    myRole,
    joinCode: null,
    activeSessionId: null,
    members: [
      { userId: 'u-dm', displayName: 'Oreana', role: 'dm', joinedAt: '2026-10-01T00:00:00Z' },
      {
        userId: testUser.id,
        displayName: 'Mira',
        role: 'player',
        joinedAt: '2026-10-02T00:00:00Z',
      },
    ],
    description: null,
    coverUrl: null,
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
    tagline: 'Zählt Sterne und Schritte.',
    characterClass: 'Waldläuferin',
    species: 'Waldelfe',
    age: '112',
    appearance: 'Eine schlanke Waldelfe mit silberblondem Zopf.',
    background: 'Späherin an einer Karawanenstraße.',
    personality: 'Wachsam und trocken im Humor.',
    bonds: 'Sucht ihren verschwundenen Bruder.',
    portraitUrl: null,
    color: null,
    ...fields,
  }
}

function open(
  characters: Character[],
  {
    id = 'ch1',
    role = 'player',
    extra = {},
  }: { id?: string; role?: Campaign['myRole']; extra?: object } = {},
) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id': json(200, campaign(role)),
    'GET /api/campaigns/:id/characters': json(200, characters),
    'PUT /api/campaigns/:id/characters/:characterId': (call) => json(200, call.body),
    ...extra,
  })
  renderApp(`/kampagnen/${CAMPAIGN}/charaktere/${id}`)
  return calls
}

const pencil = (name = 'Liriel') => screen.findByRole('button', { name: p.edit(name) })

describe('CharacterPage', () => {
  it('shows the four texts to everyone, and the pencil and status list only to its editors', async () => {
    open([character({ canEdit: false, ownerUserId: 'u2', ownerDisplayName: 'Brom' })])

    expect(await screen.findByRole('heading', { level: 1, name: 'Liriel' })).toBeInTheDocument()
    for (const text of [
      'Zählt Sterne und Schritte.',
      'Eine schlanke Waldelfe mit silberblondem Zopf.',
      'Späherin an einer Karawanenstraße.',
      'Wachsam und trocken im Humor.',
      'Sucht ihren verschwundenen Bruder.',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: p.sections.bonds.title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: p.edit('Liriel') })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: de.statuses.list.show('Liriel') }),
    ).not.toBeInTheDocument()
  })

  it('shows class, species, age and size under the name, not beside the owner', async () => {
    open([character({ species: '' })])

    await screen.findByRole('heading', { level: 1, name: 'Liriel' })
    expect(screen.getByText('Waldläuferin')).toBeVisible()
    expect(screen.getByText('112')).toBeVisible()
    expect(screen.getByText(de.sizes.medium)).toBeVisible()
    // An empty fact is left out.
    expect(screen.queryByText(t.species)).not.toBeInTheDocument()
    expect(screen.getByText(t.mine)).not.toHaveTextContent(de.sizes.medium)
  })

  it('edits the facts with the other fields', async () => {
    const calls = open([character()])
    const user = userEvent.setup()

    await user.click(await pencil())
    await user.clear(screen.getByLabelText(t.age))
    await user.type(screen.getByLabelText(t.age), ' Mitte zwanzig ')
    await user.click(screen.getByRole('button', { name: p.saveChanges }))

    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      characterClass: 'Waldläuferin',
      species: 'Waldelfe',
      age: 'Mitte zwanzig',
    })
  })

  it('says so for a text nobody has written yet', async () => {
    open([character({ bonds: '' })])

    await screen.findByRole('heading', { level: 1, name: 'Liriel' })
    expect(screen.getAllByText(p.empty)).toHaveLength(1)
    expect(screen.getByRole('region', { name: de.statuses.list.show('Liriel') })).toBeVisible()
  })

  it('shows markdown in the texts, but no links or pictures', async () => {
    open([
      character({
        bonds:
          '- **Vater:** schreibt oft\n- *Corvane*: [Lehrerin](http://x.test) ![b](http://x.test/b.png)',
      }),
    ])

    await screen.findByRole('heading', { level: 1, name: 'Liriel' })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Vater:').tagName).toBe('STRONG')
    expect(screen.queryByRole('link', { name: 'Lehrerin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'b' })).not.toBeInTheDocument()
  })

  it('keeps the status list folded until asked, and out of edit mode', async () => {
    open([character()])
    const user = userEvent.setup()

    await screen.findByRole('heading', { level: 1, name: 'Liriel' })
    const toggle = screen.getByRole('button', { name: de.statuses.list.showDm })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(await pencil())
    expect(
      screen.queryByRole('region', { name: de.statuses.list.show('Liriel') }),
    ).not.toBeInTheDocument()
  })

  it('shows the unsaved note only once something changed', async () => {
    open([character()])
    const user = userEvent.setup()

    await user.click(await pencil())
    expect(screen.queryByText(p.unsaved)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(p.sections.personality.title), '!')
    expect(screen.getByText(p.unsaved)).toBeVisible()
  })

  it('turns the page itself into the editor behind the pencil and saves every field at once', async () => {
    const calls = open([character()])
    const user = userEvent.setup()

    await user.click(await pencil())
    // No second form: the same headings now stand over boxes.
    expect(screen.getByLabelText(t.name)).toHaveValue('Liriel')
    const background = screen.getByLabelText(p.sections.background.title)
    await user.clear(background)
    await user.type(background, '  Aufgewachsen im Silberwald ')
    await user.clear(screen.getByLabelText(p.sections.bonds.title))
    await user.clear(screen.getByLabelText(p.tagline.label))
    await user.type(screen.getByLabelText(p.tagline.label), ' Sucht ihren Bruder. ')
    await user.selectOptions(screen.getByLabelText(t.size), de.sizes.small)
    await user.click(screen.getByRole('button', { name: p.saveChanges }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: p.saveChanges })).not.toBeInTheDocument(),
    )
    const put = calls.find((c) => c.method === 'PUT')
    expect(put?.path).toBe(`/api/campaigns/${CAMPAIGN}/characters/ch1`)
    expect(put?.body).toEqual({
      name: 'Liriel',
      size: 'small',
      characterClass: 'Waldläuferin',
      species: 'Waldelfe',
      age: '112',
      tagline: 'Sucht ihren Bruder.',
      appearance: 'Eine schlanke Waldelfe mit silberblondem Zopf.',
      background: 'Aufgewachsen im Silberwald',
      personality: 'Wachsam und trocken im Humor.',
      bonds: '',
      color: null,
    })
    expect(screen.queryByRole('textbox', { name: t.name })).not.toBeInTheDocument()
  })

  it('drops what was typed on cancel', async () => {
    const calls = open([character()])
    const user = userEvent.setup()

    await user.click(await pencil())
    await user.type(screen.getByLabelText(p.sections.personality.title), ' und frech')
    await user.click(screen.getByRole('button', { name: de.common.cancel }))

    expect(screen.getByText('Wachsam und trocken im Humor.')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
    await user.click(await pencil())
    expect(screen.getByLabelText(p.sections.personality.title)).toHaveValue(
      'Wachsam und trocken im Humor.',
    )
  })

  it('counts the characters of a text against its limit', async () => {
    open([character({ personality: 'Trocken' })])
    const user = userEvent.setup()

    await user.click(await pencil())

    expect(screen.getByText(/\(7\/750\)/)).toBeInTheDocument()
    // Background and bonds share the larger limit.
    expect(screen.getAllByText(/\/1500\)/)).toHaveLength(2)
  })

  it('gives a dm the owner field, and no player', async () => {
    const calls = open([character()], { role: 'dm' })
    const user = userEvent.setup()

    await user.click(await pencil())
    expect(screen.getByLabelText(t.ownerField)).toHaveValue(testUser.id)
    await user.selectOptions(screen.getByLabelText(t.ownerField), 'Oreana')
    await user.click(screen.getByRole('button', { name: p.saveChanges }))

    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ ownerUserId: 'u-dm' })
  })

  it('does not save a colour that isn’t a hex code', async () => {
    const calls = open([character({ color: '#123abc' })])
    const user = userEvent.setup()

    await user.click(await pencil())
    const field = screen.getByLabelText(t.color.custom)
    expect(field).toHaveValue('#123abc')
    await user.clear(field)
    await user.type(field, 'rot')
    await user.click(screen.getByRole('button', { name: p.saveChanges }))

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
    expect(screen.getByLabelText(t.name)).toBeVisible()
  })

  it('shows the server error in German and stays in edit mode', async () => {
    open([character()], {
      extra: {
        'PUT /api/campaigns/:id/characters/:characterId': () =>
          json(400, { code: 'textTooLong', field: 'background' }),
      },
    })
    const user = userEvent.setup()

    await user.click(await pencil())
    await user.click(screen.getByRole('button', { name: p.saveChanges }))

    const bar = await screen.findByRole('group', { name: p.edit('Liriel') })
    expect(await within(bar).findByRole('alert')).toBeVisible()
    expect(screen.getByLabelText(t.name)).toBeVisible()
  })

  it('offers portraits inside the appearance once it is filled in, and saves the texts first', async () => {
    const calls = open([character({ appearance: '' })], {
      extra: {
        'GET /api/campaigns/:id/characters/:characterId/portraits': () =>
          json(200, tokenImagesOf([])),
        'POST /api/campaigns/:id/characters/:characterId/portraits': () =>
          json(202, tokenImage({ status: 'queued' })),
      },
    })
    const user = userEvent.setup()

    await user.click(await pencil())
    const portrait = screen.getByRole('region', { name: t.portrait.title })
    const generate = within(portrait).getByRole('button', { name: t.portrait.generate })
    expect(within(portrait).getByText(t.portrait.needsAppearance)).toBeVisible()
    expect(generate).toBeDisabled()

    await user.type(screen.getByLabelText(p.sections.appearance.title), 'Waldelfe')
    await vi.waitFor(() => expect(generate).toBeEnabled())
    await user.click(generate)
    await user.click(screen.getByRole('button', { name: de.tokenImages.confirm.ok }))
    await screen.findByText(de.tokenImages.queued)

    const order = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)
    expect(order).toEqual([
      `PUT /api/campaigns/${CAMPAIGN}/characters/ch1`,
      `POST /api/campaigns/${CAMPAIGN}/characters/ch1/portraits`,
    ])
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      appearance: 'Waldelfe',
      background: 'Späherin an einer Karawanenstraße.',
    })
    // Still editing.
    expect(screen.getByRole('button', { name: p.saveChanges })).toBeVisible()
  })

  describe('a new character', () => {
    /** The campaign's characters grow by whatever is POSTed, as the server's list would. */
    function openNew(role: Campaign['myRole'] = 'player') {
      const list: Character[] = []
      const calls = mockApi({
        'GET /api/auth/me': json(200, testUser),
        'GET /api/campaigns/:id': json(200, campaign(role)),
        'GET /api/campaigns/:id/characters': () => json(200, list),
        'POST /api/campaigns/:id/characters': (call) => {
          const created = character({
            ...(call.body as Partial<Character>),
            id: 'new1',
            name: String((call.body as { name: string }).name),
          })
          list.push(created)
          return json(201, created)
        },
      })
      renderApp(`/kampagnen/${CAMPAIGN}/charaktere/neu`)
      return calls
    }

    it('opens the page as the editor, with portraits waiting for the first save', async () => {
      openNew()

      expect(await screen.findByLabelText(t.name)).toHaveValue('')
      expect(screen.getByText(p.portraitAfterSave)).toBeVisible()
      expect(screen.queryByRole('region', { name: t.portrait.title })).not.toBeInTheDocument()
      expect(screen.queryByText(p.unsaved)).not.toBeInTheDocument()
    })

    it('needs a name', async () => {
      const calls = openNew()
      const user = userEvent.setup()

      await user.type(await screen.findByLabelText(p.sections.background.title), 'Aus dem Norden')
      await user.click(screen.getByRole('button', { name: p.saveChanges }))

      expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.nameInvalid)
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    })

    it('creates the character and shows its page', async () => {
      const calls = openNew()
      const user = userEvent.setup()

      await user.type(await screen.findByLabelText(t.name), ' Ireena ')
      await user.type(screen.getByLabelText(t.characterClass), 'Duellantin')
      await user.click(screen.getByRole('button', { name: t.color.addCustom }))
      await user.type(screen.getByLabelText(t.color.custom), 'A1B2C3')
      await user.click(screen.getByRole('button', { name: p.saveChanges }))

      expect(await screen.findByRole('heading', { level: 1, name: 'Ireena' })).toBeVisible()
      const post = calls.find((c) => c.method === 'POST')
      expect(post?.path).toBe(`/api/campaigns/${CAMPAIGN}/characters`)
      expect(post?.body).toMatchObject({
        name: 'Ireena',
        size: 'medium',
        characterClass: 'Duellantin',
        color: '#a1b2c3',
      })
      expect(post?.body).not.toHaveProperty('ownerUserId')
    })

    it('lets a dm give it to a player straight away', async () => {
      const calls = openNew('dm')
      const user = userEvent.setup()

      await user.type(await screen.findByLabelText(t.name), 'Brom')
      expect(screen.getByLabelText(t.ownerField)).toHaveValue(testUser.id)
      await user.selectOptions(screen.getByLabelText(t.ownerField), 'Oreana')
      await user.click(screen.getByRole('button', { name: p.saveChanges }))

      await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
      expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ ownerUserId: 'u-dm' })
    })
  })

  it('says so when the campaign has no such character', async () => {
    open([character()], { id: 'other' })

    expect(await screen.findByText(p.unknownBody)).toBeInTheDocument()
  })
})
