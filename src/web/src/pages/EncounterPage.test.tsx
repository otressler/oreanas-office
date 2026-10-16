import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardState, BoardToken, MoveResult, TokenMovedEvent } from '../api/types'
import { encounter, ids, smallBoard } from '../encounters/testing'
import { deferred, FakeHub, fakeTable, refused } from '../table/testing'
import { json, mockApi, renderApp, testUser } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../table/FakeTableBoard')).FakeTableBoard,
}))
// The table's connection is the fake hub in `fakeTable` (src/test/setup.ts).

const fightPath = `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`

/** Mira's character, on the clearing's top-left cell. */
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
}

function runningBoard(fields: Partial<BoardState> = {}): BoardState {
  const board = smallBoard({ status: 'active', sessionId: ids.session })
  return { ...board, tokens: [...board.tokens, hero], ...fields }
}

function moved(fields: Partial<TokenMovedEvent>): TokenMovedEvent {
  return {
    encounterId: ids.encounter,
    tokenId: hero.id,
    x: 0,
    y: 0,
    elevation: 0,
    version: 1,
    byUserId: testUser.id,
    undo: false,
    ...fields,
  }
}

let hub: FakeHub

beforeEach(() => {
  hub = new FakeHub()
  fakeTable.hub = hub
})

function openFight(board: BoardState = runningBoard()) {
  const calls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id/encounters/:eid/board': () => json(200, board),
  })
  const app = renderApp(fightPath)
  return { ...app, calls, user: userEvent.setup() }
}

const cell = (x: number, y: number) => screen.getByRole('button', { name: `Feld ${x},${y}` })
const tokenText = (label: string) =>
  within(screen.getByRole('list', { name: 'Figuren' })).getByText(new RegExp(`^Figur ${label} `))
const indicator = () => screen.getByTestId('connection-indicator')

/** Until the table has joined the encounter. */
async function connected() {
  await vi.waitFor(() => expect(indicator()).toHaveAttribute('data-status', 'connected'))
}

describe('EncounterPage', () => {
  it('shows the board to a player, without the end button', async () => {
    openFight()

    expect(await screen.findByRole('heading', { name: 'Kleine Lichtung' })).toBeInTheDocument()
    expect(screen.getByTestId('board')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: de.encounters.back })).toHaveAttribute(
      'href',
      `/kampagnen/${ids.campaign}`,
    )
    expect(screen.queryByRole('button', { name: de.encounters.end })).not.toBeInTheDocument()
  })

  it('says the fight isn’t running when a player gets 404', async () => {
    mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id/encounters/:eid/board': () => json(404),
    })
    renderApp(fightPath)

    expect(
      await screen.findByRole('heading', { name: de.encounters.notRunningTitle }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: de.encounters.back })).toBeInTheDocument()
  })

  it('says the fight is over when the board is ended', async () => {
    openFight(runningBoard({ status: 'ended' }))

    expect(
      await screen.findByRole('heading', { name: de.encounters.overTitle }),
    ).toBeInTheDocument()
    expect(hub.connections).toHaveLength(0)
  })

  it('lets the session DM end the fight after confirming, then goes to the session', async () => {
    const calls = mockApi({
      'GET /api/auth/me': json(200, testUser),
      'GET /api/campaigns/:id/encounters/:eid/board': () =>
        json(200, runningBoard({ isSessionDm: true })),
      'POST /api/campaigns/:id/sessions/:sid/encounters/:eid/end': () =>
        json(200, encounter({ status: 'ended', sessionId: ids.session })),
    })
    const { router } = renderApp(fightPath)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: de.encounters.end }))
    expect(screen.getByText(de.encounters.endQuestion)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: de.encounters.endConfirm }))

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/kampagnen/${ids.campaign}/sitzungen/${ids.session}`,
      ),
    )
    expect(calls.find((c) => c.method === 'POST')?.path).toBe(
      `/api/campaigns/${ids.campaign}/sessions/${ids.session}/encounters/${ids.encounter}/end`,
    )
  })

  it('joins the table, then reloads the board', async () => {
    const { calls } = openFight()
    await connected()

    expect(hub.calls('JoinEncounter')).toEqual([[ids.encounter]])
    await vi.waitFor(() => expect(calls.filter((c) => c.path.endsWith('/board'))).toHaveLength(2))
  })

  it('selects, previews and confirms a move, showing it at once', async () => {
    const answer = deferred<MoveResult>()
    hub.respond = (method) => (method === 'MoveToken' ? answer.promise : { error: null })
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()
    expect(screen.getByText(de.table.pickTarget('Held'))).toBeInTheDocument()

    await user.click(cell(1, 1))
    expect(screen.getByText('Vorschau Held auf 1,1')).toBeInTheDocument()
    expect(tokenText('Held')).toHaveTextContent('auf 0,0')
    expect(screen.getByText(de.table.confirmHint('Held'))).toBeInTheDocument()

    // Another cell moves the preview; tapping it again confirms.
    await user.click(cell(2, 1))
    expect(screen.getByText('Vorschau Held auf 2,1')).toBeInTheDocument()
    await user.click(cell(2, 1))

    expect(hub.calls('MoveToken')).toEqual([[{ tokenId: hero.id, x: 2, y: 1 }]])
    expect(tokenText('Held')).toHaveTextContent('auf 2,1')
    // The own move jumps; it doesn't slide in.
    expect(tokenText('Held')).toHaveAttribute('data-instant', 'true')
    expect(screen.queryByText(/^Vorschau/)).not.toBeInTheDocument()

    await act(async () => answer.resolve({ error: null, move: moved({ x: 2, y: 1, version: 1 }) }))
    expect(tokenText('Held')).toHaveTextContent('auf 2,1')
    expect(tokenText('Held')).not.toHaveAttribute('data-instant')
    expect(screen.getByRole('button', { name: de.table.undo })).toBeInTheDocument()
  })

  it('confirms with the "Hierhin" button and cancels with "Abbrechen" or Escape', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    await user.click(screen.getByRole('button', { name: de.table.cancel }))
    expect(screen.queryByText('Ausgewählt: Held')).not.toBeInTheDocument()

    await user.click(cell(0, 0))
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Ausgewählt: Held')).not.toBeInTheDocument()

    await user.click(cell(0, 0))
    expect(screen.queryByRole('button', { name: de.table.confirm })).not.toBeInTheDocument()
    await user.click(cell(1, 0))
    await user.click(screen.getByRole('button', { name: de.table.confirm }))
    expect(hub.calls('MoveToken')).toEqual([[{ tokenId: hero.id, x: 1, y: 0 }]])
  })

  it('shows the others the preview until the move is confirmed or let go of', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    expect(hub.calls('PreviewMove')).toHaveLength(0)
    // A preview reaches the others once it has stood for a moment.
    await user.click(cell(1, 1))
    expect(hub.calls('PreviewMove')).toHaveLength(0)
    await waitFor(() => expect(hub.calls('PreviewMove')).toHaveLength(1))
    await user.click(cell(2, 1))
    await waitFor(() => expect(hub.calls('PreviewMove')).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: de.table.cancel }))
    expect(hub.calls('PreviewMove')).toEqual([
      [{ tokenId: hero.id, x: 1, y: 1 }],
      [{ tokenId: hero.id, x: 2, y: 1 }],
    ])
    expect(hub.calls('ClearPreview')).toHaveLength(1)

    // Confirming sends the move first, which clears the preview on the server.
    await user.click(cell(0, 0))
    await user.click(cell(1, 0))
    await waitFor(() => expect(hub.calls('PreviewMove')).toHaveLength(3))
    await user.click(cell(1, 0))
    const order = hub.invocations.map((call) => call.method).filter((m) => m !== 'MarkActive')
    expect(order.slice(-3)).toEqual(['PreviewMove', 'MoveToken', 'ClearPreview'])

    // A preview confirmed at once never reaches the others.
    await user.click(cell(1, 0))
    await user.click(cell(0, 0))
    await user.click(cell(0, 0))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(hub.calls('PreviewMove')).toHaveLength(3)
  })

  it('draws an arrow where someone else is about to move a token', async () => {
    openFight()
    await connected()

    const preview = { encounterId: ids.encounter, tokenId: 't1', byUserId: 'dm' }
    act(() => hub.latest.emit('MovePreviewed', { ...preview, x: 2, y: 1 }))
    expect(screen.getByText('Pfeil Goblin 1 nach 2,1')).toBeInTheDocument()

    act(() => hub.latest.emit('MovePreviewCleared', preview))
    expect(screen.queryByText(/^Pfeil/)).not.toBeInTheDocument()

    // Gone with the connection, too.
    act(() => hub.latest.emit('MovePreviewed', { ...preview, x: 2, y: 1 }))
    act(() => hub.latest.close(new Error('gone')))
    expect(screen.queryByText(/^Pfeil/)).not.toBeInTheDocument()
  })

  it('puts the token back with the German message when the server says no', async () => {
    hub.respond = (method) => (method === 'MoveToken' ? refused('notYourToken') : { error: null })
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    await user.click(cell(1, 0))
    await user.click(cell(1, 0))

    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.notYourToken)
    expect(tokenText('Held')).toHaveTextContent('auf 0,0')
    expect(screen.queryByRole('button', { name: de.table.undo })).not.toBeInTheDocument()
  })

  it('keeps a newer move from someone else when the own move fails', async () => {
    const answer = deferred<MoveResult>()
    hub.respond = (method) => (method === 'MoveToken' ? answer.promise : { error: null })
    const { user } = openFight(runningBoard({ isSessionDm: true }))
    await connected()

    await user.click(cell(0, 0))
    await user.click(cell(1, 0))
    await user.click(cell(1, 0))
    act(() => hub.latest.emit('TokenMoved', moved({ x: 2, y: 0, version: 1, byUserId: 'dm2' })))
    await act(async () => answer.resolve(refused('targetInvalid')))

    expect(tokenText('Held')).toHaveTextContent('auf 2,0')
  })

  it('draws the person’s own character on top of a creature standing on it', async () => {
    const board = runningBoard()
    const goblin = { ...board.tokens[0]!, x: 0, y: 0 }
    openFight({ ...board, tokens: [hero, goblin, ...board.tokens.slice(1)] })
    await connected()

    const drawn = within(screen.getByRole('list', { name: 'Figuren' })).getAllByRole('listitem')
    expect(drawn.at(-1)).toHaveTextContent('Figur Held auf 0,0')
  })

  it('stays selected with a hint on a cell the token can’t stand on', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    await user.click(cell(3, 1)) // the wall
    expect(screen.getByRole('status')).toHaveTextContent(de.table.invalidTarget)
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()
    expect(hub.calls('MoveToken')).toHaveLength(0)
  })

  it('shows info for tokens the person can’t move, and takes their cell as a target', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(3, 0)) // the goblin
    expect(screen.getByText('Info Goblin 1')).toBeInTheDocument()
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()

    await user.click(cell(0, 0))
    await user.click(cell(3, 0))
    expect(screen.getByText('Vorschau Held auf 3,0')).toBeInTheDocument()
  })

  it('lets the session DM move a creature', async () => {
    const { user } = openFight(runningBoard({ isSessionDm: true }))
    await connected()

    await user.click(cell(3, 0))
    expect(screen.getByText('Ausgewählt: Goblin 1')).toBeInTheDocument()
  })

  it('moves tokens when the server says someone else moved them', async () => {
    openFight()
    await connected()

    act(() =>
      hub.latest.emit(
        'TokenMoved',
        moved({ tokenId: 't1', x: 2, y: 0, version: 1, byUserId: 'dm' }),
      ),
    )
    expect(tokenText('Goblin 1')).toHaveTextContent('auf 2,0')
    expect(tokenText('Goblin 1')).not.toHaveAttribute('data-instant')

    // An older event changes nothing.
    act(() => hub.latest.emit('TokenMoved', moved({ tokenId: 't1', x: 0, y: 1, version: 1 })))
    expect(tokenText('Goblin 1')).toHaveTextContent('auf 2,0')
  })

  it('undoes the own last move while it is the token’s latest', async () => {
    hub.respond = (method) =>
      method === 'UndoMove'
        ? { error: null, move: moved({ x: 0, y: 0, version: 3, undo: true }) }
        : { error: null }
    const { user } = openFight(
      runningBoard({
        tokens: [{ ...hero, x: 1, y: 0, version: 2 }],
        undoableMove: { tokenId: hero.id, version: 2 },
      }),
    )
    await connected()

    await user.click(await screen.findByRole('button', { name: de.table.undo }))
    expect(hub.calls('UndoMove')).toEqual([[ids.encounter]])
    expect(tokenText('Held')).toHaveTextContent('auf 0,0')
    expect(screen.queryByRole('button', { name: de.table.undo })).not.toBeInTheDocument()
  })

  it('hides undo once someone else moved the token, and shows the error when undo fails', async () => {
    hub.respond = (method) => (method === 'UndoMove' ? refused('nothingToUndo') : { error: null })
    const { user } = openFight(
      runningBoard({
        tokens: [{ ...hero, x: 1, y: 0, version: 2 }],
        undoableMove: { tokenId: hero.id, version: 2 },
      }),
    )
    await connected()

    await user.click(await screen.findByRole('button', { name: de.table.undo }))
    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.nothingToUndo)
    expect(screen.queryByRole('button', { name: de.table.undo })).not.toBeInTheDocument()
  })

  it('hides undo when the token moved on', async () => {
    openFight(
      runningBoard({
        tokens: [{ ...hero, x: 1, y: 0, version: 2 }],
        undoableMove: { tokenId: hero.id, version: 2 },
      }),
    )
    await connected()
    expect(await screen.findByRole('button', { name: de.table.undo })).toBeInTheDocument()

    act(() => hub.latest.emit('TokenMoved', moved({ x: 2, y: 0, version: 3, byUserId: 'dm' })))
    expect(screen.queryByRole('button', { name: de.table.undo })).not.toBeInTheDocument()
  })

  it('switches moving off while the connection is lost, and shows it', async () => {
    const { user } = openFight(
      runningBoard({
        tokens: [{ ...hero, version: 2 }],
        undoableMove: { tokenId: hero.id, version: 2 },
      }),
    )
    await connected()
    await user.click(cell(0, 0))
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()

    hub.startWith = () => new Promise(() => {})
    act(() => hub.latest.close(new Error('gone')))

    await vi.waitFor(() => expect(indicator()).toHaveTextContent(de.table.status.reconnecting))
    // The selection is gone, undo hides, and tapping the own token only says why.
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: de.table.undo })).not.toBeInTheDocument()
    await user.click(cell(0, 0))
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(de.table.movingOff)
    expect(hub.calls('MoveToken')).toHaveLength(0)
  })

  it('reloads the board when the fight ends', async () => {
    const { calls } = openFight()
    await connected()
    await vi.waitFor(() => expect(calls.filter((c) => c.path.endsWith('/board'))).toHaveLength(2))

    act(() => hub.latest.emit('EncounterEnded', ids.encounter))
    await vi.waitFor(() => expect(calls.filter((c) => c.path.endsWith('/board'))).toHaveLength(3))
  })
})
