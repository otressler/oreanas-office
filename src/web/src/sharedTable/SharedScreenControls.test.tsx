import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HubConnection } from '@microsoft/signalr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { BoardState, BoardToken } from '../api/types'
import { DOUBLE_TAP_MS } from '../board/gestures'
import { smallBoard } from '../encounters/testing'
import { fakeBoard } from '../table/fakeBoard'
import { PREVIEW_SEND_DELAY_MS } from '../table/FightTable'
import { SharedScreenControls } from './SharedScreenControls'

vi.mock('../board/Board', async () => ({
  Board: (await import('../table/FakeTableBoard')).FakeTableBoard,
}))
vi.mock('../auth/auth', () => ({
  useCurrentUser: () => ({ id: 'u-brom', displayName: 'Brom' }),
}))

function character(id: string, label: string, x: number, owner: string): BoardToken {
  return {
    ...smallBoard().tokens[0]!,
    id,
    kind: 'character',
    characterId: `c-${id}`,
    creatureTypeId: null,
    ownerUserId: owner,
    label,
    x,
    y: 0,
    size: 'medium',
    colorIndex: 0,
  }
}

function board(fields: Partial<BoardState> = {}): BoardState {
  const base = smallBoard({ status: 'active', playMode: 'local', viewer: 'player' })
  return {
    ...base,
    // The goblin stands on 3,0; Thorin (Brom's) and Aria (Yara's) are characters.
    tokens: [
      ...base.tokens,
      character('t-thorin', 'Thorin', 0, 'u-brom'),
      character('t-aria', 'Aria', 1, 'u-yara'),
    ],
    ...fields,
  }
}

type Handler = (...args: unknown[]) => void

/** A hub connection that records calls and lets a test send server messages. */
function fakeConnection() {
  const handlers = new Map<string, Set<Handler>>()
  const invoke = vi.fn(async (method: string, ..._args: unknown[]) => {
    if (method === 'MoveToken') return { error: null, move: { version: 1 } }
    return { error: null }
  })
  const connection = {
    invoke,
    on: (event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    },
    off: (event: string, handler: Handler) => handlers.get(event)?.delete(handler),
  } as unknown as HubConnection
  const send = (event: string, ...args: unknown[]) =>
    act(() => handlers.get(event)?.forEach((handler) => handler(...args)))
  return { connection, invoke, send }
}

function renderControls(b: BoardState, connection: HubConnection | null) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SharedScreenControls encounterId={b.encounterId} board={b} connection={connection} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('SharedScreenControls', () => {
  it('selects any character, whoever owns it, but not a creature', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { connection } = fakeConnection()
    renderControls(board(), connection)

    await user.click(screen.getByRole('button', { name: 'Feld 1,0' }))
    expect(screen.getByText('Ausgewählt: Aria')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Feld 1,0' }))
    expect(screen.queryByText(/Ausgewählt/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Feld 3,0' }))
    expect(screen.queryByText(/Ausgewählt/)).not.toBeInTheDocument()
  })

  it('previews and moves a character of another player with the usual taps', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { connection, invoke } = fakeConnection()
    renderControls(board(), connection)

    await user.click(screen.getByRole('button', { name: 'Feld 1,0' }))
    await user.click(screen.getByRole('button', { name: 'Feld 2,1' }))
    expect(screen.getByText('Vorschau Aria auf 2,1')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_SEND_DELAY_MS + 1))
    expect(invoke).toHaveBeenCalledWith('PreviewMove', { tokenId: 't-aria', x: 2, y: 1 })

    await user.click(screen.getByRole('button', { name: 'Feld 2,1' }))
    await act(() => vi.advanceTimersByTimeAsync(DOUBLE_TAP_MS + 1))
    expect(invoke).toHaveBeenCalledWith('MoveToken', { tokenId: 't-aria', x: 2, y: 1 })
  })

  it('pings as the table, in white', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { connection, invoke } = fakeConnection()
    renderControls(board(), connection)

    await user.click(screen.getByRole('button', { name: 'Feld 2,1' }))
    act(() => fakeBoard.doubleTap({ x: 2, y: 1 }))

    expect(screen.getByText('Zeigen Tisch auf 2,1')).toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('Ping', {
      encounterId: board().encounterId,
      cell: { x: 2, y: 1 },
      tokenId: null,
    })
  })

  it('lets go of the selected token and takes its preview back when the mode switches back', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { connection, invoke, send } = fakeConnection()
    renderControls(board(), connection)
    await user.click(screen.getByRole('button', { name: 'Feld 1,0' }))
    expect(screen.getByText('Ausgewählt: Aria')).toBeInTheDocument()

    send('PlayModeChanged', { sessionId: 's', playMode: 'byod' })

    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
    expect(invoke).toHaveBeenCalledWith('ClearPreview')
  })

  it('renders nothing while the session is in "Eigene Geräte"', () => {
    const { connection } = fakeConnection()
    renderControls(board({ playMode: 'byod' }), connection)
    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
  })

  it('does not move without a connection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderControls(board(), null)
    await user.click(screen.getByRole('button', { name: 'Feld 1,0' }))
    expect(screen.queryByText(/Ausgewählt/)).not.toBeInTheDocument()
  })
})
