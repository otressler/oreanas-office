// The fight page's live table (knowledge/features/playable-map.md, "Phone controls";
// knowledge/decisions/realtime-sync.md): the board with select, preview and confirm,
// optimistic moves with rollback, undo, and the connection indicator.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApiErrorCode, BoardState, BoardToken, UndoableMove } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { Board } from '../board/Board'
import { buildGrid, placementElevation, type GridPoint } from '../board/geometry'
import { Button } from '../components/ui'
import { FightScreen } from '../encounters/FightScreen'
import { de } from '../text/de'
import { ConnectionIndicator } from './ConnectionIndicator'
import {
  IDLE,
  canMoveToken,
  confirmPreview,
  currentControls,
  tapBoard,
  type Controls,
  type MoveIntent,
} from './controls'
import { mergeKnown, withPending, type PendingMoves } from './merge'
import { isUndoVisible, undoCandidate } from './undo'
import { useTable } from './useTable'

const t = de.table

/** A hint after a tap, or why a move or undo didn't go through. */
interface Notice {
  kind: 'hint' | 'error'
  text: string
}

/** Errors after which the board itself has changed: the fight ended or the token is gone. */
const RELOAD_ON: readonly ApiErrorCode[] = ['encounterNotActive', 'tokenNotFound']

/**
 * The running fight's board with the live table (knowledge/features/playable-map.md):
 * tap a token, tap a cell to preview, tap again to confirm; the move shows at once and
 * goes back if the server says no. Moves by others slide in; "Rückgängig" puts back the
 * person's own last move. Moving is off unless the table is connected.
 */
export function FightTable({
  campaignId,
  board,
  actions,
}: {
  campaignId: string
  /** The board as loaded (and updated by events) in the query cache. */
  board: BoardState
  actions?: ReactNode
}) {
  const me = useCurrentUser()
  const running = board.status === 'active'
  const table = useTable(campaignId, board.encounterId, running)
  const connected = table.status === 'connected'
  const grid = useMemo(() => buildGrid(board.map), [board.map])

  const [pending, setPending] = useState<PendingMoves>(() => new Map())
  // Which send owns a token's pending move, so an older answer doesn't clear a newer one.
  const sends = useRef(new Map<string, number>())
  const [controls, setControls] = useState<Controls>(IDLE)
  const [notice, setNotice] = useState<Notice | null>(null)

  // The device's own undo; a reload that brings a new `undoableMove` takes over again.
  const [ownUndo, setOwnUndo] = useState<UndoableMove | null | undefined>(undefined)
  const [boardUndo, setBoardUndo] = useState(board.undoableMove)
  if (boardUndo !== board.undoableMove) {
    setBoardUndo(board.undoableMove)
    setOwnUndo(undefined)
  }

  const shown = useMemo(
    () => withPending(mergeKnown(board, table.known), pending),
    [board, table.known, pending],
  )
  const instant = useMemo(() => new Set(pending.keys()), [pending])
  const current = currentControls(controls, shown.tokens, running && connected)
  const selected =
    current.mode === 'idle' ? null : shown.tokens.find((token) => token.id === current.tokenId)!
  const undoable = undoCandidate(ownUndo, board.undoableMove)
  const showUndo = isUndoVisible(undoable, shown.tokens, connected)

  const canMove = useCallback(
    (token: BoardToken) => canMoveToken(token, board, me.id),
    [board, me.id],
  )

  const fail = (code: ApiErrorCode | null, fallback: string) => {
    setNotice({ kind: 'error', text: code ? de.errors[code] : fallback })
    if (code && RELOAD_ON.includes(code)) table.reload()
  }

  async function send(intent: MoveIntent) {
    const token = shown.tokens.find((candidate) => candidate.id === intent.tokenId)
    if (!token) return
    const elevation = placementElevation(grid, token.size, intent.x, intent.y)
    const id = (sends.current.get(token.id) ?? 0) + 1
    sends.current.set(token.id, id)
    setPending((moves) => new Map(moves).set(token.id, { x: intent.x, y: intent.y, elevation }))
    try {
      const result = await table.move(intent)
      if (result.move) {
        table.apply(result.move)
        setOwnUndo({ tokenId: token.id, version: result.move.version })
      } else {
        fail(result.error, t.moveFailed)
      }
    } catch {
      fail(null, t.moveFailed)
    } finally {
      // The token stays where the newest known version puts it: the move's, or back.
      if (sends.current.get(token.id) === id) {
        setPending((moves) => {
          const next = new Map(moves)
          next.delete(token.id)
          return next
        })
      }
    }
  }

  async function undo() {
    setNotice(null)
    setOwnUndo(null)
    try {
      const result = await table.undo()
      if (result.move) table.apply(result.move)
      else fail(result.error, t.undoFailed)
    } catch {
      fail(null, t.undoFailed)
    }
  }

  function tap(cell: GridPoint, token?: BoardToken): boolean {
    const result = tapBoard(
      current,
      { cell, token },
      { tokens: shown.tokens, grid, canMove, enabled: running && connected },
    )
    setControls(result.controls)
    const hint =
      result.hint === 'invalidTarget'
        ? t.invalidTarget
        : result.hint === 'movingOff' && running
          ? t.movingOff
          : null
    setNotice(hint ? { kind: 'hint', text: hint } : null)
    if (result.confirm) void send(result.confirm)
    return !result.info
  }

  function confirm() {
    const intent = confirmPreview(current)
    setControls(IDLE)
    setNotice(null)
    if (intent) void send(intent)
  }

  const cancel = useCallback(() => {
    setControls(IDLE)
    setNotice(null)
  }, [])

  // Escape lets go of the selected token.
  const selecting = current.mode !== 'idle'
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, cancel])

  return (
    <FightScreen
      campaignId={campaignId}
      title={board.name}
      status={table.status && <ConnectionIndicator status={table.status} />}
      actions={actions}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Board
          board={shown}
          onCellTap={(cell) => tap(cell)}
          onTokenTap={(token, cell) => tap(cell, token)}
          selectedTokenId={selected?.id ?? null}
          ghost={
            current.mode === 'preview' ? { tokenId: current.tokenId, ...current.target } : null
          }
          slide
          instantTokenIds={instant}
          className="min-h-0 flex-1"
        />

        {(selected || notice) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3">
            {selected && (
              <div
                role="group"
                aria-label={selected.label}
                className="pointer-events-auto flex max-w-md flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg shadow-black/40"
              >
                <p aria-live="polite" className="min-w-0 flex-1 basis-48 text-sm text-parchment">
                  {current.mode === 'preview'
                    ? t.confirmHint(selected.label)
                    : t.pickTarget(selected.label)}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  {current.mode === 'preview' && (
                    <Button variant="primary" onClick={confirm}>
                      {t.confirm}
                    </Button>
                  )}
                  <Button variant="quiet" onClick={cancel}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            )}
            {notice && (
              <p
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className={`pointer-events-auto max-w-md rounded-lg border px-3 py-2 text-sm shadow-lg shadow-black/40 ${
                  notice.kind === 'error'
                    ? 'border-red-400/50 bg-red-950/90 text-red-100'
                    : 'border-candle/40 bg-panel/95 text-parchment'
                }`}
              >
                {notice.text}
              </p>
            )}
          </div>
        )}

        {showUndo && (
          <Button
            onClick={() => void undo()}
            className="absolute bottom-3 left-3 z-20 bg-panel/90 shadow-lg shadow-black/40"
          >
            <UndoIcon />
            {t.undo}
          </Button>
        )}
      </div>
    </FightScreen>
  )
}

/** An arrow curving back to the left. */
function UndoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}
