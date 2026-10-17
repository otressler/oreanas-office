// The fight page's token card (knowledge/features/token-card.md), statuses
// (statuses.md) and taking tokens off the board (removing-tokens.md), against the fake
// board and hub as in EncounterPage.test.tsx.
import type { QueryClient } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BoardState,
  BoardToken,
  BoardTokenStatus,
  StatusDefinition,
  StatusPicker,
  StatusResult,
  TokenStatusesChangedEvent,
} from '../api/types'
import { ids, smallBoard } from '../encounters/testing'
import { FakeHub, fakeTable } from '../table/testing'
import { UNDO_REMOVE_MS } from '../table/RemovedTokens'
import { json, mockApi, renderApp, testUser, type ApiCall } from '../test/api'
import { de } from '../text/de'

vi.mock('../board/Board', async () => ({
  Board: (await import('../table/FakeTableBoard')).FakeTableBoard,
}))

const fightPath = `/kampagnen/${ids.campaign}/kampf/${ids.encounter}`
const DM = 'd0000000-0000-0000-0000-000000000009'
const OTHER = 'o0000000-0000-0000-0000-000000000008'

const prone: StatusDefinition = {
  id: 'st-prone',
  libraryKey: 'prone',
  name: 'Liegend',
  hasLevels: false,
  iconUrl: '/statuses/prone.webp',
  iconDescription: null,
  characterId: null,
}
const exhaustion: StatusDefinition = {
  ...prone,
  id: 'st-exhaustion',
  libraryKey: 'exhaustion',
  name: 'Erschöpfung',
  hasLevels: true,
  iconUrl: '/statuses/exhaustion.webp',
}
const hexed: StatusDefinition = {
  ...prone,
  id: 'st-hexed',
  libraryKey: null,
  name: 'Verhext',
  iconUrl: null,
  iconDescription: 'ein lila Auge',
  characterId: 'ch-hero',
}

function applied(statusId: string, by: string, level: number | null = null): BoardTokenStatus {
  return { statusId, level, appliedByUserId: by, appliedAt: '2026-10-16T18:00:00Z' }
}

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
/** Someone else's character next to Mira's. */
const friend: BoardToken = {
  ...hero,
  id: 't-friend',
  characterId: 'ch-friend',
  ownerUserId: OTHER,
  label: 'Brom',
  x: 1,
  colorIndex: 1,
}

function runningBoard(fields: Partial<BoardState> = {}): BoardState {
  const board = smallBoard({ status: 'active', sessionId: ids.session })
  return {
    ...board,
    tokens: [...board.tokens, hero, friend],
    statuses: [prone, exhaustion, hexed],
    people: [
      { userId: testUser.id, displayName: 'Mira', pingColor: '#4da3ff' },
      { userId: DM, displayName: 'Oreana', pingColor: '#f0c46e' },
      { userId: OTHER, displayName: 'Eli', pingColor: '#4cc76a' },
    ],
    ...fields,
  }
}

function changed(tokenId: string, statuses: BoardTokenStatus[]): TokenStatusesChangedEvent {
  return {
    encounterId: ids.encounter,
    tokenId,
    statuses,
    definitions: [prone, exhaustion, hexed],
  }
}

const picker: StatusPicker = {
  lists: [
    {
      kind: 'character',
      characterId: 'ch-hero',
      characterName: 'Held',
      statuses: [prone, exhaustion, hexed],
    },
  ],
}

let hub: FakeHub

beforeEach(() => {
  hub = new FakeHub()
  fakeTable.hub = hub
})

let apiCalls: ApiCall[] = []
let queryClient: QueryClient | null = null

function openFight(board: BoardState = runningBoard()) {
  const calls = (apiCalls = mockApi({
    'GET /api/auth/me': json(200, testUser),
    'GET /api/campaigns/:id/encounters/:eid/board': () => json(200, board),
    'GET /api/campaigns/:id/encounters/:eid/status-picker': () => json(200, picker),
  }))
  const app = renderApp(fightPath)
  queryClient = app.queryClient
  // A card that just opened lets taps through for the double-tap time (FightTable); people
  // can't reach its buttons that fast, tests can.
  return {
    ...app,
    calls,
    user: userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never }),
  }
}

const cell = (x: number, y: number) => screen.getByRole('button', { name: `Feld ${x},${y}` })
const card = () => screen.getByRole('region', { name: de.tokenCard.label })
const queryCard = () => screen.queryByRole('region', { name: de.tokenCard.label })
const tokenText = (label: string) =>
  within(screen.getByRole('list', { name: 'Figuren' })).queryByText(new RegExp(`^Figur ${label} `))

/** Until the table has joined and the board's reload after joining has landed. */
async function connected() {
  await vi.waitFor(() =>
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected'),
  )
  await vi.waitFor(() => expect(apiCalls.filter((c) => c.path.endsWith('/board'))).toHaveLength(2))
  await vi.waitFor(() => expect(queryClient!.isFetching()).toBe(0))
}

describe('the token card', () => {
  it('opens on a creature without selecting it, and a tap on a cell closes it', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(3, 0))
    const goblin = card()
    expect(within(goblin).getByRole('heading', { name: 'Goblin 1' })).toBeInTheDocument()
    expect(within(goblin).getByText(de.tokenCard.creature)).toBeInTheDocument()
    expect(within(goblin).getByText('Klein · Höhe 0 m')).toBeInTheDocument()
    expect(within(goblin).getByText(de.tokenCard.noStatuses)).toBeInTheDocument()
    // Players put statuses on creatures, and ping them; they don't remove tokens.
    expect(within(goblin).getByRole('button', { name: de.tokenCard.addStatus })).toBeEnabled()
    expect(within(goblin).getByRole('button', { name: de.tokenCard.show })).toBeEnabled()
    expect(
      within(goblin).queryByRole('button', { name: de.tokenCard.remove }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()

    await user.click(cell(2, 1))
    expect(queryCard()).not.toBeInTheDocument()

    // With nothing open, a cell shows its terrain in the card's place; again closes it.
    await user.click(cell(2, 1))
    const field = screen.getByRole('region', { name: de.tokenCard.cellLabel })
    expect(within(field).getByRole('heading', { name: 'Boden' })).toBeInTheDocument()
    expect(within(field).getByText('Höhe 0 m')).toBeInTheDocument()
    await user.click(cell(2, 1))
    expect(screen.queryByRole('region', { name: de.tokenCard.cellLabel })).not.toBeInTheDocument()
  })

  it('selects the person’s own character with the card, and ✕ lets go', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()
    expect(within(card()).getByText(de.tokenCard.characterOf('Mira'))).toBeInTheDocument()
    expect(within(card()).getByText(de.table.pickTarget('Held'))).toBeInTheDocument()

    // The card stays while a target is picked.
    await user.click(cell(1, 1))
    expect(within(card()).getByText(de.table.confirmHint('Held'))).toBeInTheDocument()

    await user.click(within(card()).getByRole('button', { name: de.tokenCard.close }))
    expect(queryCard()).not.toBeInTheDocument()
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Vorschau/)).not.toBeInTheDocument()
  })

  it('lets go when the selected token is tapped again, and closes on Escape', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(0, 0))
    await user.click(cell(0, 0))
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()
    expect(within(card()).getByRole('heading', { name: 'Held' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(queryCard()).not.toBeInTheDocument()
  })

  it('folds to one line and stays folded for the next token', async () => {
    const { user } = openFight()
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.fold }))
    expect(within(card()).queryByText(de.tokenCard.creature)).not.toBeInTheDocument()
    expect(within(card()).getByRole('heading', { name: 'Goblin 1' })).toBeInTheDocument()

    await user.click(cell(2, 1))
    await user.click(cell(1, 0))
    expect(within(card()).getByRole('heading', { name: 'Brom' })).toBeInTheDocument()
    expect(within(card()).queryByText(de.tokenCard.characterOf('Eli'))).not.toBeInTheDocument()

    await user.click(within(card()).getByRole('button', { name: de.tokenCard.unfold }))
    expect(within(card()).getByText(de.tokenCard.characterOf('Eli'))).toBeInTheDocument()
  })

  it('lists a stack, the person’s own token first, and a row selects or shows its token', async () => {
    // Drawn bottom to top on 0,0: Mira's hero, then a goblin on top of it.
    const board = runningBoard()
    const goblin = { ...board.tokens[0]!, x: 0, y: 0 }
    const { user } = openFight({ ...board, tokens: [hero, goblin, friend] })
    await connected()

    await user.click(cell(0, 0))
    // The tap selects the person's own token under the goblin.
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()
    const rows = within(card()).getByRole('list', { name: de.tokenCard.stack(2) })
    const buttons = within(rows).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      de.tokenCard.selectRow('Held'),
      de.tokenCard.viewRow('Goblin 1'),
    ])
    expect(buttons[0]).toHaveAttribute('aria-current', 'true')

    // A row the person may not move shows its details; the selection stays.
    await user.click(buttons[1]!)
    expect(within(card()).getByRole('heading', { name: 'Goblin 1' })).toBeInTheDocument()
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()

    // Their own row selects their token again after letting go.
    await user.click(within(card()).getByRole('button', { name: de.table.cancel }))
    expect(screen.queryByText(/^Ausgewählt/)).not.toBeInTheDocument()
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.selectRow('Held') }))
    expect(screen.getByText('Ausgewählt: Held')).toBeInTheDocument()
  })

  it('pings the token with "Zeigen"', async () => {
    hub.respond = () => ({ error: null })
    const { user } = openFight()
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.show }))
    expect(hub.calls('Ping')).toEqual([[{ encounterId: ids.encounter, cell: null, tokenId: 't1' }]])
  })

  it('switches its buttons off without a connection', async () => {
    const { user } = openFight()
    await connected()
    hub.startWith = () => new Promise(() => {})
    act(() => hub.latest.close(new Error('gone')))

    await user.click(cell(3, 0))
    expect(within(card()).getByRole('button', { name: de.tokenCard.addStatus })).toBeDisabled()
    expect(within(card()).getByText(de.tokenCard.needsConnection)).toBeInTheDocument()
  })
})

describe('statuses on the card', () => {
  it('shows statuses with who put them on; a player can’t take off the DM’s', async () => {
    const goblin = smallBoard().tokens[0]!
    const { user } = openFight(
      runningBoard({
        tokens: [
          {
            ...goblin,
            statuses: [applied(prone.id, DM), applied(exhaustion.id, testUser.id, 2)],
          },
          hero,
          friend,
        ],
      }),
    )
    await connected()

    await user.click(cell(3, 0))
    const statuses = within(card()).getByRole('region', { name: de.tokenCard.statuses })
    expect(within(statuses).getByText('Liegend')).toBeInTheDocument()
    expect(within(statuses).getByText('von Oreana')).toBeInTheDocument()
    expect(within(statuses).getByText('Erschöpfung 2')).toBeInTheDocument()
    expect(within(statuses).getByText('von Mira')).toBeInTheDocument()
    // Only the status Mira put on is a button.
    expect(within(statuses).getAllByRole('button')).toHaveLength(1)
  })

  it('takes off and levels the person’s own status', async () => {
    const goblin = smallBoard().tokens[0]!
    const mine = applied(exhaustion.id, testUser.id, 2)
    hub.respond = (method, args) => {
      const request = args[0] as { tokenId: string; level?: number }
      if (method === 'SetStatusLevel')
        return {
          error: null,
          change: changed(request.tokenId, [{ ...mine, level: request.level! }]),
        } satisfies StatusResult
      if (method === 'RemoveStatus')
        return { error: null, change: changed(request.tokenId, []) } satisfies StatusResult
      return { error: null }
    }
    const { user } = openFight(
      runningBoard({ tokens: [{ ...goblin, statuses: [mine] }, hero, friend] }),
    )
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: /Erschöpfung 2/ }))
    await user.click(
      within(card()).getByRole('button', { name: de.tokenCard.levelUp('Erschöpfung') }),
    )
    expect(hub.calls('SetStatusLevel')).toEqual([
      [{ tokenId: 't1', statusId: exhaustion.id, level: 3 }],
    ])
    expect(within(card()).getByText('Erschöpfung 3')).toBeInTheDocument()

    await user.click(within(card()).getByRole('button', { name: de.tokenCard.statusRemove }))
    expect(hub.calls('RemoveStatus')).toEqual([[{ tokenId: 't1', statusId: exhaustion.id }]])
    expect(within(card()).getByText(de.tokenCard.noStatuses)).toBeInTheDocument()
  })

  it('shows a refused status change in German', async () => {
    const goblin = smallBoard().tokens[0]!
    hub.respond = (method) =>
      method === 'RemoveStatus' ? { error: 'notYourStatus', change: null } : { error: null }
    const { user } = openFight(
      runningBoard({
        tokens: [{ ...goblin, statuses: [applied(prone.id, testUser.id)] }, hero, friend],
      }),
    )
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: /Liegend/ }))
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.statusRemove }))
    expect(await screen.findByRole('alert')).toHaveTextContent(de.errors.notYourStatus)
  })

  it('puts a status on from the picker at once, and a second tap takes it off', async () => {
    hub.respond = (method, args) => {
      const request = args[0] as { tokenId: string; statusId: string }
      if (method === 'AddStatus')
        return {
          error: null,
          change: changed(request.tokenId, [applied(request.statusId, testUser.id)]),
        } satisfies StatusResult
      if (method === 'RemoveStatus')
        return { error: null, change: changed(request.tokenId, []) } satisfies StatusResult
      return { error: null }
    }
    const { user, calls } = openFight()
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.addStatus }))
    const dialog = await screen.findByRole('dialog', {
      name: de.statuses.picker.title('Goblin 1'),
    })
    expect(
      within(dialog).getByRole('region', { name: de.statuses.picker.characterList('Held') }),
    ).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/status-picker'))).toHaveLength(1)

    await user.click(
      within(dialog).getByRole('button', { name: de.statuses.picker.add('Liegend') }),
    )
    expect(hub.calls('AddStatus')).toEqual([[{ tokenId: 't1', statusId: prone.id, level: null }]])
    const set = within(dialog).getByRole('button', { name: de.statuses.picker.remove('Liegend') })
    expect(set).toHaveAttribute('aria-pressed', 'true')
    expect(within(card()).getByText('Liegend')).toBeInTheDocument()

    await user.click(set)
    expect(hub.calls('RemoveStatus')).toEqual([[{ tokenId: 't1', statusId: prone.id }]])

    await user.click(within(dialog).getByRole('button', { name: de.statuses.picker.done }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Opened again, the picker is asked for again.
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.addStatus }))
    await screen.findByRole('dialog')
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.path.endsWith('/status-picker'))).toHaveLength(2),
    )
  })

  it('shows the error of a refused status in the picker', async () => {
    hub.respond = (method) =>
      method === 'AddStatus' ? { error: 'statusAlreadySet', change: null } : { error: null }
    const { user } = openFight()
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.addStatus }))
    const dialog = await screen.findByRole('dialog')
    await user.click(
      within(dialog).getByRole('button', { name: de.statuses.picker.add('Liegend') }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(de.errors.statusAlreadySet)
  })

  it('offers no statuses on another player’s character, but the session DM may', async () => {
    const { user } = openFight()
    await connected()
    await user.click(cell(1, 0))
    expect(
      within(card()).queryByRole('button', { name: de.tokenCard.addStatus }),
    ).not.toBeInTheDocument()
  })

  it('updates the card when someone else changes a status', async () => {
    const { user } = openFight()
    await connected()
    await user.click(cell(3, 0))

    act(() => hub.latest.emit('TokenStatusesChanged', changed('t1', [applied(prone.id, DM)])))
    expect(await within(card()).findByText('Liegend')).toBeInTheDocument()
    expect(within(card()).getByText('von Oreana')).toBeInTheDocument()
  })
})

describe('taking tokens off the board', () => {
  function dmBoard(fields: Partial<BoardState> = {}) {
    return runningBoard({ isSessionDm: true, ...fields })
  }

  it('offers no "Vom Feld nehmen" to players', async () => {
    const { user } = openFight()
    await connected()
    await user.click(cell(3, 0))
    expect(
      within(card()).queryByRole('button', { name: de.tokenCard.remove }),
    ).not.toBeInTheDocument()
  })

  it('removes a token for the session DM, with undo for a few seconds', async () => {
    hub.respond = () => ({ error: null })
    const { user } = openFight(dmBoard())
    await connected()

    await user.click(cell(3, 0))
    await user.click(within(card()).getByRole('button', { name: de.tokenCard.remove }))
    expect(hub.calls('RemoveToken')).toEqual([['t1']])

    act(() =>
      hub.latest.emit('TokenRemoved', {
        encounterId: ids.encounter,
        tokenId: 't1',
        byUserId: DM,
        removedAt: '2026-10-16T19:15:00Z',
      }),
    )
    await vi.waitFor(() => expect(tokenText('Goblin 1')).toBeNull())
    expect(queryCard()).not.toBeInTheDocument()
    const bar = screen.getByTestId('undo-remove')
    expect(bar).toHaveTextContent(de.tokenCard.removed('Goblin 1'))

    await user.click(within(bar).getByRole('button', { name: de.tokenCard.undo }))
    expect(hub.calls('RestoreToken')).toEqual([['t1']])
    expect(screen.queryByTestId('undo-remove')).not.toBeInTheDocument()

    const goblin = smallBoard().tokens[0]!
    act(() =>
      hub.latest.emit('TokenRestored', {
        encounterId: ids.encounter,
        token: goblin,
        definitions: [],
      }),
    )
    await vi.waitFor(() => expect(tokenText('Goblin 1')).toHaveTextContent('auf 3,0'))
  })

  it('hides the undo bar after a few seconds', async () => {
    hub.respond = () => ({ error: null })
    const { user } = openFight(dmBoard())
    await connected()
    await user.click(cell(3, 0))

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await user.click(within(card()).getByRole('button', { name: de.tokenCard.remove }))
      expect(screen.getByTestId('undo-remove')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(UNDO_REMOVE_MS + 10))
      expect(screen.queryByTestId('undo-remove')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes a stack’s token from its row', async () => {
    hub.respond = () => ({ error: null })
    const board = dmBoard()
    const goblin = { ...board.tokens[0]!, x: 0, y: 0 }
    const { user } = openFight({ ...board, tokens: [hero, goblin, friend] })
    await connected()

    await user.click(cell(0, 0))
    await user.click(
      within(card()).getByRole('button', { name: de.tokenCard.removeRow('Goblin 1') }),
    )
    expect(hub.calls('RemoveToken')).toEqual([['t1']])
  })

  it('lists removed tokens in the top bar, newest first, to bring back', async () => {
    hub.respond = () => ({ error: null })
    const goblin = smallBoard().tokens[0]!
    const { user } = openFight(
      dmBoard({
        tokens: [hero, friend],
        removedTokens: [
          { ...goblin, removedAt: '2026-10-16T19:20:00Z' },
          { ...goblin, id: 't2', label: 'Goblin 2', removedAt: '2026-10-16T19:10:00Z' },
        ],
      }),
    )
    await connected()

    await user.click(screen.getByRole('button', { name: de.tokenCard.removedListCount(2) }))
    const list = screen.getByRole('dialog', { name: de.tokenCard.removedList })
    const restore = within(list).getAllByRole('button')
    expect(restore.map((b) => b.getAttribute('aria-label'))).toEqual([
      de.tokenCard.restoreRow('Goblin 1'),
      de.tokenCard.restoreRow('Goblin 2'),
    ])
    await user.click(restore[1]!)
    expect(hub.calls('RestoreToken')).toEqual([['t2']])
  })

  it('shows no removed list to players', async () => {
    openFight(runningBoard())
    await connected()
    expect(screen.queryByRole('button', { name: /^Vom Feld genommen/ })).not.toBeInTheDocument()
  })
})
