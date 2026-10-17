// The fight page with fog of war and creature spawn (stage 10, knowledge/features/fog-of-war.md,
// creature-spawn.md): the session DM's fog mode with its confirm step, the creature reveal
// buttons on the card, "Spieleransicht", the player's fog view with its events, and spawn
// with confirm and undo. Against the fake board and hub as in EncounterPage.test.tsx.
import { act, screen, within } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BoardState,
  BoardToken,
  FogChangedEvent,
  TokenHiddenEvent,
  TokenRevealedEvent,
  TokensAddedEvent,
} from '../api/types'
import { ids, smallBoard } from '../encounters/testing'
import { FakeHub, fakeTable } from '../table/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../table/FakeTableBoard')).FakeTableBoard,
}))

const fightPath = `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`
const t = de.fog

/** Mira's character on the clearing's top-left cell. */
const hero: BoardToken = {
  id: 't-hero',
  kind: 'character',
  characterId: 'ch-hero',
  creatureTypeId: null,
  ownerUserId: testUser.id,
  label: 'Held',
  x: 0,
  y: 0,
  elevation: 0,
  size: 'medium',
  colorIndex: 0,
  version: 0,
  imageUrl: null,
  color: null,
  statuses: [],
  hidden: false,
}

/** A creature standing on the clearing; `t1` is the board's goblin. */
function goblin(id: string, label: string, x: number, y: number, hidden = false): BoardToken {
  return { ...smallBoard().tokens[0]!, id, label, x, y, hidden }
}

/** The clearing (4 × 2) with its east half in fog: cells 2,0 3,0 2,1; "Nordkammer" is those. */
const fog = {
  version: 1,
  hiddenCells: [
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 2, y: 1 },
  ],
  areas: [
    {
      id: 'a1',
      name: 'Nordkammer',
      cells: [
        [2, 0],
        [3, 0],
        [2, 1],
      ],
    },
  ],
}

/** The session DM's board: two hidden goblins in the fog and the hero outside it. */
function dmBoard(fields: Partial<BoardState> = {}): BoardState {
  return {
    ...smallBoard({ status: 'active', sessionId: ids.session }),
    isSessionDm: true,
    viewer: 'dm',
    fog,
    tokens: [hero, goblin('t1', 'Goblin', 3, 0, true), goblin('t2', 'Goblin', 2, 0, true)],
    ...fields,
  }
}

/** A player's board: no hidden creatures, the hidden cells without a layout. */
function playerBoard(fields: Partial<BoardState> = {}): BoardState {
  const board = smallBoard({ status: 'active', sessionId: ids.session })
  const visible = board.map.layout.cells.filter(
    (cell) => !fog.hiddenCells.some((h) => h.x === cell.x && h.y === cell.y),
  )
  return {
    ...board,
    viewer: 'player',
    isSessionDm: false,
    fog: { ...fog, areas: [] },
    map: { ...board.map, layout: { ...board.map.layout, cells: visible } },
    tokens: [hero],
    ...fields,
  }
}

let hub: FakeHub

beforeEach(() => {
  hub = new FakeHub()
  hub.respond = () => ({ error: null, tokenIds: ['t-wolf'] })
  fakeTable.hub = hub
})

let boardLoads: () => number

function openFight(board: BoardState, extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id/encounters/:eid/board': () => json(200, board),
    ...extra,
  })
  boardLoads = () => calls.filter((call) => call.path.endsWith('/board')).length
  const app = renderApp(fightPath)
  return {
    ...app,
    calls,
    user: userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never }),
  }
}

const cell = (x: number, y: number) => screen.getByRole('button', { name: `Feld ${x},${y}` })
const tokens = () => within(screen.getByRole('list', { name: 'Figuren' }))
const tokenItem = (label: string) => tokens().queryAllByText(new RegExp(`^Figur ${label} `))
const hiddenCells = () =>
  within(screen.getByRole('list', { name: 'Nebel' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)
const indicator = () => screen.getByTestId('connection-indicator')
const card = () => screen.getByRole('region', { name: de.tokenCard.label })

/** Until the table has joined and the board it reloads after joining has arrived. */
async function connected() {
  await vi.waitFor(() => expect(indicator()).toHaveAttribute('data-status', 'connected'))
  await vi.waitFor(() => expect(boardLoads()).toBeGreaterThanOrEqual(2))
  await act(async () => {})
}

/** The confirm bar's verb button, not the direction segment of the same name. */
const confirmButton = (verb: string) =>
  within(screen.getByTestId('fog-bar'))
    .getAllByRole('button', { name: verb })
    .find((button) => !button.hasAttribute('aria-pressed'))!

const fogEvent = (fields: Partial<FogChangedEvent>): FogChangedEvent => ({
  encounterId: ids.encounter,
  version: 2,
  reveal: true,
  cells: [],
  revealedLayout: null,
  appeared: [],
  disappeared: [],
  numbered: [],
  ...fields,
})

describe('the session DM’s fog mode', () => {
  it('shows the fog hatched to the DM with the hidden creatures see-through', async () => {
    openFight(dmBoard())
    await connected()
    expect(screen.getByRole('list', { name: 'Nebel' })).toHaveAttribute('data-look', 'dm')
    expect(hiddenCells()).toEqual(['Nebel 2,0', 'Nebel 2,1', 'Nebel 3,0'])
    expect(tokenItem('Goblin')).toHaveLength(2)
    for (const item of tokenItem('Goblin')) expect(item).toHaveAttribute('data-hidden', 'true')
  })

  it('has no fog button for a player, and none without the session DM role', async () => {
    openFight(playerBoard())
    await connected()
    expect(screen.queryByRole('button', { name: t.board.fogButton })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.spawn.button })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: t.board.playerView })).not.toBeInTheDocument()
  })

  it('disables the Nebel button while the encounter has no fog', async () => {
    openFight(dmBoard({ fog: null }))
    await connected()
    expect(screen.getByRole('button', { name: t.board.fogButton })).toBeDisabled()
    expect(screen.queryByRole('list', { name: 'Nebel' })).not.toBeInTheDocument()
  })

  it('previews the chosen cells and sends nothing until the DM confirms', async () => {
    const { user } = openFight(dmBoard())
    await connected()

    await user.click(screen.getByRole('button', { name: t.board.fogButton }))
    expect(screen.getByTestId('fog-bar')).toBeInTheDocument()
    await user.click(cell(2, 0))
    await user.click(cell(2, 1))
    expect(screen.getByText(t.board.confirmReveal(2))).toBeInTheDocument()
    expect(screen.getByText('Markiert 2,0 2,1')).toBeInTheDocument()
    expect(hub.calls('ChangeFog')).toEqual([])

    // "Abbrechen" drops it; players never hear of it.
    await user.click(screen.getByRole('button', { name: t.board.cancel }))
    expect(screen.queryByText(/^Markiert/)).not.toBeInTheDocument()
    expect(hub.calls('ChangeFog')).toEqual([])

    await user.click(cell(2, 1))
    await user.click(confirmButton(t.board.reveal))
    expect(hub.calls('ChangeFog')).toEqual([
      [{ encounterId: ids.encounter, cells: [{ x: 2, y: 1 }], reveal: true }],
    ])
    // The change comes back as FogChanged and the preview is gone.
    act(() => hub.latest.emit('FogChanged', fogEvent({ cells: [{ x: 2, y: 1 }] })))
    expect(hiddenCells()).toEqual(['Nebel 2,0', 'Nebel 3,0'])
    expect(screen.queryByText(/^Markiert/)).not.toBeInTheDocument()
  })

  it('offers "Rückgängig" for a few seconds, which asks the server to undo', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(screen.getByRole('button', { name: t.board.fogButton }))
    await user.click(cell(2, 1))
    await user.click(confirmButton(t.board.reveal))

    const bar = await screen.findByTestId('undo-change')
    expect(bar).toHaveTextContent(t.board.revealed(1))
    await user.click(within(bar).getByRole('button', { name: t.board.undo }))
    expect(hub.calls('UndoChange')).toEqual([[ids.encounter]])
    expect(screen.queryByTestId('undo-change')).not.toBeInTheDocument()
  })

  it('takes the cells of an area in one tap', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(screen.getByRole('button', { name: t.board.fogButton }))

    await user.click(screen.getByRole('button', { name: t.board.tools.area }))
    await user.click(cell(2, 1))
    expect(screen.getByText(t.board.confirmReveal(3))).toBeInTheDocument()
    await user.click(confirmButton(t.board.reveal))
    expect(hub.calls('ChangeFog')).toEqual([
      [
        {
          encounterId: ids.encounter,
          reveal: true,
          cells: [
            { x: 2, y: 0 },
            { x: 3, y: 0 },
            { x: 2, y: 1 },
          ],
        },
      ],
    ])
  })

  it('hides revealed cells when "Verdecken" is picked', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(screen.getByRole('button', { name: t.board.fogButton }))
    await user.click(screen.getByRole('button', { name: t.board.hide }))
    await user.click(cell(1, 1))
    expect(screen.getByText('1 Feld verdecken?')).toBeInTheDocument()
    await user.click(confirmButton(t.board.hide))
    expect(hub.calls('ChangeFog')).toEqual([
      [{ encounterId: ids.encounter, cells: [{ x: 1, y: 1 }], reveal: false }],
    ])
  })

  it('says so when a change is refused, and keeps the preview', async () => {
    hub.respond = (method) => (method === 'ChangeFog' ? { error: 'fogInvalid' } : { error: null })
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(screen.getByRole('button', { name: t.board.fogButton }))
    await user.click(cell(2, 1))
    await user.click(confirmButton(t.board.reveal))
    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.fogInvalid)
    expect(screen.getByText('Markiert 2,1')).toBeInTheDocument()
  })

  it('doesn’t open the token card while fog mode is on', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(screen.getByRole('button', { name: t.board.fogButton }))
    await user.click(cell(3, 0))
    expect(screen.queryByRole('region', { name: de.tokenCard.label })).not.toBeInTheDocument()
    expect(screen.getByText('Markiert 3,0')).toBeInTheDocument()
  })

  it('"Spieleransicht" shows what players see and sends nothing', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(screen.getByRole('switch', { name: t.board.playerView }))

    expect(screen.getByText(t.board.playerViewNote)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Nebel' })).toHaveAttribute('data-look', 'player')
    expect(tokenItem('Goblin')).toHaveLength(0)
    expect(tokenItem('Held')).toHaveLength(1)
    // Nothing can be changed there: fog mode and spawn are off.
    expect(screen.getByRole('button', { name: t.board.fogButton })).toBeDisabled()
    expect(screen.getByRole('button', { name: t.spawn.button })).toBeDisabled()
    await user.click(cell(2, 0))
    expect(screen.getByText(t.unexplored)).toBeInTheDocument()
    expect(hub.calls('ChangeFog')).toEqual([])

    await user.click(screen.getByRole('switch', { name: t.board.playerView }))
    expect(screen.getByRole('list', { name: 'Nebel' })).toHaveAttribute('data-look', 'dm')
    expect(tokenItem('Goblin')).toHaveLength(2)
  })
})

describe('revealing creatures from the token card', () => {
  it('reveals a hidden creature, with a note on its card and "Rückgängig"', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(cell(3, 0))
    expect(within(card()).getByText(t.token.hiddenNote)).toBeInTheDocument()
    await user.click(within(card()).getByRole('button', { name: t.token.reveal }))
    expect(hub.calls('SetTokensHidden')).toEqual([
      [{ encounterId: ids.encounter, tokenIds: ['t1'], hidden: false }],
    ])

    const revealed: TokenRevealedEvent = {
      encounterId: ids.encounter,
      token: goblin('t1', 'Goblin 1', 3, 0, false),
    }
    act(() => hub.latest.emit('TokenRevealed', revealed))
    await vi.waitFor(() => expect(tokenItem('Goblin 1')).toHaveLength(1))
    expect(tokenItem('Goblin 1')[0]).not.toHaveAttribute('data-hidden')
    const bar = await screen.findByTestId('undo-change')
    expect(bar).toHaveTextContent(t.token.revealed('Goblin'))
  })

  it('reveals every hidden creature in the same area with "Alle verborgenen hier"', async () => {
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: `${t.token.revealAllHere} (2)` }))
    expect(hub.calls('SetTokensHidden')).toEqual([
      [{ encounterId: ids.encounter, tokenIds: ['t1', 't2'], hidden: false }],
    ])
    expect(await screen.findByTestId('undo-change')).toHaveTextContent(t.token.revealedMany(2))
  })

  it('offers "Verbergen" on a creature players see, and hides it', async () => {
    const shown = goblin('t3', 'Goblin 1', 1, 1)
    const { user } = openFight(dmBoard({ tokens: [hero, shown] }))
    await connected()
    await user.click(cell(1, 1))
    expect(within(card()).queryByText(t.token.hiddenNote)).not.toBeInTheDocument()
    await user.click(within(card()).getByRole('button', { name: t.token.hide }))
    expect(hub.calls('SetTokensHidden')).toEqual([
      [{ encounterId: ids.encounter, tokenIds: ['t3'], hidden: true }],
    ])
    act(() => hub.latest.emit('TokenHidden', { encounterId: ids.encounter, tokenId: 't3' }))
    await vi.waitFor(() => expect(tokenItem('Goblin 1')[0]).toHaveAttribute('data-hidden', 'true'))
  })

  it('has no reveal buttons for a player', async () => {
    const shown = goblin('t3', 'Goblin 1', 1, 1)
    const { user } = openFight(playerBoard({ tokens: [hero, shown] }))
    await connected()
    await user.click(cell(1, 1))
    expect(within(card()).queryByRole('button', { name: t.token.hide })).not.toBeInTheDocument()
  })
})

describe('the player’s view of the fog', () => {
  it('draws the fog opaque and says "Unerkundet" for a hidden cell', async () => {
    const { user } = openFight(playerBoard())
    await connected()
    expect(screen.getByRole('list', { name: 'Nebel' })).toHaveAttribute('data-look', 'player')
    expect(hiddenCells()).toHaveLength(3)
    await user.click(cell(2, 0))
    expect(screen.getByText(t.unexplored)).toBeInTheDocument()
  })

  it('can’t choose a hidden cell as a target, but can move on the revealed ones', async () => {
    const { user } = openFight(playerBoard())
    await connected()
    await user.click(cell(0, 0))
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()
    await user.click(cell(2, 0))
    expect(screen.queryByText(/^Vorschau/)).not.toBeInTheDocument()
    await user.click(cell(1, 1))
    expect(screen.getByText('Vorschau Held auf 1,1')).toBeInTheDocument()
  })

  it('shows the cells and creatures a reveal brings, and takes hidden ones away', async () => {
    openFight(playerBoard())
    await connected()

    const wolf = goblin('t-w', 'Goblin 1', 3, 0)
    act(() =>
      hub.latest.emit(
        'FogChanged',
        fogEvent({
          cells: [{ x: 3, y: 0 }],
          appeared: [wolf],
          numbered: [],
        }),
      ),
    )
    expect(hiddenCells()).toEqual(['Nebel 2,0', 'Nebel 2,1'])
    await vi.waitFor(() => expect(tokenItem('Goblin 1')).toHaveLength(1))

    // The DM hides the cell again: the fog is back and the goblin disappears with it.
    act(() =>
      hub.latest.emit(
        'FogChanged',
        fogEvent({ version: 3, reveal: false, cells: [{ x: 3, y: 0 }], disappeared: ['t-w'] }),
      ),
    )
    expect(hiddenCells()).toHaveLength(3)
    await vi.waitFor(() => expect(tokenItem('Goblin 1')).toHaveLength(0))
  })

  it('numbers a creature at first sight, and drops one that is hidden', async () => {
    openFight(playerBoard({ tokens: [hero, goblin('t-w', 'Goblin', 1, 1)] }))
    await connected()
    act(() =>
      hub.latest.emit(
        'FogChanged',
        fogEvent({
          cells: [{ x: 3, y: 0 }],
          numbered: [{ tokenId: 't-w', number: 1, label: 'Goblin 1' }],
        }),
      ),
    )
    await vi.waitFor(() => expect(tokenItem('Goblin 1')).toHaveLength(1))

    const hidden: TokenHiddenEvent = { encounterId: ids.encounter, tokenId: 't-w' }
    act(() => hub.latest.emit('TokenHidden', hidden))
    await vi.waitFor(() => expect(tokenItem('Goblin 1')).toHaveLength(0))
  })

  it('ignores a fog event that is older than the fog it already has', async () => {
    openFight(playerBoard({ fog: { ...fog, version: 5, areas: [] } }))
    await connected()
    act(() => hub.latest.emit('FogChanged', fogEvent({ version: 4, cells: [{ x: 3, y: 0 }] })))
    expect(hiddenCells()).toHaveLength(3)
  })
})

describe('creature spawn', () => {
  /** The bestiary through the sync routes: a wolf and the board's goblin. */
  const bestiary = {
    'GET /api/sync/campaigns/:id/versions': () =>
      json(200, {
        creatureTypes: [
          { id: 'goblin', version: 1 },
          { id: 'wolf', version: 1 },
        ],
        battleMaps: [],
        encounters: [],
        sessions: [],
      }),
    'POST /api/sync/campaigns/:id/items': () =>
      json(
        200,
        [
          ['goblin', 'Goblin', 'small'],
          ['wolf', 'Wolf', 'medium'],
        ].map(([id, name, size]) => ({
          id,
          kind: 'creatureType',
          campaignId: ids.campaign,
          version: 1,
          updatedAt: '2026-10-16T10:00:00Z',
          updatedByDisplayName: null,
          campaign: null,
          map: null,
          encounter: null,
          creatureType: { name, size, appearance: '', notes: '', archivedAt: null },
        })),
      ),
  }

  /** The DM picks a wolf and taps two cells; the board has no fog. */
  async function placeTwoWolves(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: t.spawn.button }))
    await user.click(await screen.findByRole('button', { name: t.spawn.pick('Wolf') }))
    await user.click(cell(1, 0))
    await user.click(cell(1, 1))
  }

  const noFog = () => dmBoard({ fog: null, tokens: [hero, goblin('t1', 'Goblin 1', 3, 0)] })

  it('shows the placed creatures to the DM only, see-through, until the DM confirms', async () => {
    const { user } = openFight(noFog(), bestiary)
    await connected()
    await placeTwoWolves(user)

    const preview = tokenItem('Wolf')
    expect(preview.map((item) => item.textContent)).toEqual([
      'Figur Wolf 1 auf 1,0',
      'Figur Wolf 2 auf 1,1',
    ])
    for (const item of preview) expect(item).toHaveAttribute('data-faint', 'true')
    expect(hub.calls('SpawnCreatures')).toEqual([])

    await user.click(screen.getByRole('button', { name: t.spawn.done }))
    expect(screen.getByText(t.spawn.confirm(2))).toBeInTheDocument()
    expect(hub.calls('SpawnCreatures')).toEqual([])
  })

  it('sends one request for the whole spawn on "Erscheinen lassen", then offers undo', async () => {
    const { user } = openFight(noFog(), bestiary)
    await connected()
    await placeTwoWolves(user)
    await user.click(screen.getByRole('button', { name: t.spawn.done }))
    await user.click(screen.getByRole('button', { name: t.spawn.appear }))

    expect(hub.calls('SpawnCreatures')).toEqual([
      [
        {
          encounterId: ids.encounter,
          hidden: false,
          creatures: [
            { creatureTypeId: 'wolf', x: 1, y: 0 },
            { creatureTypeId: 'wolf', x: 1, y: 1 },
          ],
        },
      ],
    ])
    // The panel and the previews are gone; the server's TokensAdded brings the real tokens.
    expect(screen.queryByTestId('spawn-confirm')).not.toBeInTheDocument()
    expect(tokenItem('Wolf')).toHaveLength(0)
    const added: TokensAddedEvent = {
      encounterId: ids.encounter,
      tokens: [goblin('w1', 'Wolf 1', 1, 0), goblin('w2', 'Wolf 2', 1, 1)],
    }
    act(() => hub.latest.emit('TokensAdded', added))
    await vi.waitFor(() => expect(tokenItem('Wolf')).toHaveLength(2))
    for (const item of tokenItem('Wolf')) expect(item).not.toHaveAttribute('data-faint')

    const bar = await screen.findByTestId('undo-change')
    expect(bar).toHaveTextContent(t.spawn.appeared(2))
    await user.click(within(bar).getByRole('button', { name: t.board.undo }))
    expect(hub.calls('UndoChange')).toEqual([[ids.encounter]])
  })

  it('sends hidden when "Verborgen" is on', async () => {
    const { user } = openFight(noFog(), bestiary)
    await connected()
    await user.click(screen.getByRole('button', { name: t.spawn.button }))
    await user.click(await screen.findByRole('button', { name: t.spawn.pick('Wolf') }))
    await user.click(cell(1, 1))
    await user.click(screen.getByRole('button', { name: t.spawn.done }))
    await user.click(screen.getByRole('switch', { name: t.spawn.hidden }))
    await user.click(screen.getByRole('button', { name: t.spawn.appear }))
    expect(hub.calls('SpawnCreatures')).toEqual([
      [
        {
          encounterId: ids.encounter,
          hidden: true,
          creatures: [{ creatureTypeId: 'wolf', x: 1, y: 1 }],
        },
      ],
    ])
  })

  it('takes a placed creature away when it is tapped again, and cancels without sending', async () => {
    const { user } = openFight(noFog(), bestiary)
    await connected()
    await placeTwoWolves(user)
    await user.click(cell(1, 1))
    expect(tokenItem('Wolf')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: t.spawn.cancel }))
    expect(tokenItem('Wolf')).toHaveLength(0)
    expect(screen.queryByTestId('spawn-placing')).not.toBeInTheDocument()
    expect(hub.calls('SpawnCreatures')).toEqual([])
  })

  it('numbers previews without a number in an encounter with fog', async () => {
    const { user } = openFight(dmBoard(), bestiary)
    await connected()
    await user.click(screen.getByRole('button', { name: t.spawn.button }))
    await user.click(await screen.findByRole('button', { name: t.spawn.pick('Wolf') }))
    await user.click(cell(1, 1))
    expect(tokenItem('Wolf')[0]).toHaveTextContent('Figur Wolf auf 1,1')
  })

  it('shows a refused spawn as an alert and keeps the placed creatures', async () => {
    hub.respond = (method) =>
      method === 'SpawnCreatures' ? { error: 'spawnInvalid', tokenIds: null } : { error: null }
    const { user } = openFight(noFog(), bestiary)
    await connected()
    await user.click(screen.getByRole('button', { name: t.spawn.button }))
    await user.click(await screen.findByRole('button', { name: t.spawn.pick('Wolf') }))
    await user.click(cell(1, 1))
    await user.click(screen.getByRole('button', { name: t.spawn.done }))
    await user.click(screen.getByRole('button', { name: t.spawn.appear }))
    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.spawnInvalid)
    expect(tokenItem('Wolf')).toHaveLength(1)
  })
})
