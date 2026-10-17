// The fight page's live table (knowledge/features/playable-map.md, "Phone controls";
// knowledge/decisions/realtime-sync.md): the board with select, preview and confirm,
// optimistic moves with rollback, undo, the connection indicator, and arrows where
// others are about to move tokens. Stage 9: pings and arrows from double taps, whose
// first tap is taken back; haptic feedback on the mover's device; "Meine Figur"; the
// token card with statuses (knowledge/features/token-card.md, statuses.md); and taking
// tokens off the board with undo and a list to bring them back (removing-tokens.md).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ApiErrorCode, BoardState, BoardToken, StatusResult, UndoableMove } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { Board, type BoardHandle } from '../board/Board'
import { buildGrid, placementElevation, type GridPoint } from '../board/geometry'
import { DOUBLE_TAP_MS } from '../board/gestures'
import type { PingTarget } from '../board/pings'
import { buildScene } from '../board/scene'
import { Button } from '../components/ui'
import { FightScreen } from '../encounters/FightScreen'
import { useDmFog } from '../fog/useDmFog'
import { useWideScreen } from '../lib/useWideScreen'
import { PresenceRow } from '../sharedTable/PresenceRow'
import { canRemoveStatus } from '../statuses/rules'
import { StatusPicker } from '../statuses/StatusPicker'
import { de } from '../text/de'
import { showCard } from '../tokenCard/card'
import { TokenCard } from '../tokenCard/TokenCard'
import { ConnectionIndicator } from './ConnectionIndicator'
import { vibrate } from './haptics'
import { MyCharacterButton } from './MyCharacterButton'
import { usePings } from './usePings'
import {
  IDLE,
  canMoveToken,
  confirmPreview,
  currentControls,
  ownTokensOnTop,
  pickRow,
  tapBoard,
  type Card,
  type Controls,
  type MoveIntent,
} from './controls'
import { mergeFog } from './fogMerge'
import { mergeKnown, withPending, type PendingMoves } from './merge'
import { moveArrows } from './previews'
import { RemovedTokensMenu, UndoRemoveBar, type JustRemoved } from './RemovedTokens'
import { isUndoVisible, undoCandidate } from './undo'
import { useTable } from './useTable'

const t = de.table

/**
 * How long a preview must stand before the others see it, so the first tap of a double
 * tap never flickers on other devices (knowledge/features/pings-and-arrows.md).
 */
export const PREVIEW_SEND_DELAY_MS = 300

/** A hint after a tap, or why a move or undo didn't go through. */
interface Notice {
  kind: 'hint' | 'error'
  text: string
}

/** Errors after which the board itself has changed: the fight ended or the token is gone. */
const RELOAD_ON: readonly ApiErrorCode[] = ['encounterNotActive', 'tokenNotFound']

/** Gap between the board's edge and the card's panel on wide screens. */
const PANEL_GAP = 12

/**
 * The running fight's board with the live table (knowledge/features/playable-map.md):
 * tap a token, tap a cell to preview, tap again to confirm; the move shows at once and
 * goes back if the server says no. Moves by others slide in; "Rückgängig" puts back the
 * person's own last move. Moving is off unless the table is connected. A tap on a token
 * opens its card; the card's buttons put statuses on, ping the token and, for the session
 * DM, take it off the board.
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
  const pings = usePings(board, me.id)
  const table = useTable(campaignId, board.encounterId, running, pings.events)
  const boardHandle = useRef<BoardHandle>(null)
  const connected = table.status === 'connected'
  const wide = useWideScreen()
  const grid = useMemo(() => buildGrid(board.map), [board.map])
  const scene = useMemo(() => buildScene(board.map), [board.map])

  const [pending, setPending] = useState<PendingMoves>(() => new Map())
  // Which send owns a token's pending move, so an older answer doesn't clear a newer one.
  const sends = useRef(new Map<string, number>())
  const [controls, setControls] = useState<Controls>(IDLE)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  // Folded stays for the next token, as long as the page is open.
  const [folded, setFolded] = useState(false)
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [justRemoved, setJustRemoved] = useState<JustRemoved | null>(null)
  // The page as it was before the last tap, for taking it back on a double tap.
  const beforeTap = useRef<{ controls: Controls; notice: Notice | null; card: Card | null } | null>(
    null,
  )
  // A move confirmed by tapping its preview waits DOUBLE_TAP_MS before it is sent, so the
  // first tap of a double tap never moves the token (knowledge/features/token-card.md).
  // It already shows at its target meanwhile.
  const heldConfirm = useRef<{ intent: MoveIntent; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  )
  useEffect(() => () => clearTimeout(heldConfirm.current?.timer), [])
  // A card that wasn't open lets taps through for DOUBLE_TAP_MS, and the board makes room
  // for it only then: it may lie under the second touch of a double tap (the wide panel top
  // right, the phone sheet at the bottom), and panning would move the cell away from it.
  const [cardWaiting, setCardWaiting] = useState(false)
  const cardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(cardTimer.current), [])

  // The device's own undo; a reload that brings a new `undoableMove` takes over again.
  const [ownUndo, setOwnUndo] = useState<UndoableMove | null | undefined>(undefined)
  const [boardUndo, setBoardUndo] = useState(board.undoableMove)
  if (boardUndo !== board.undoableMove) {
    setBoardUndo(board.undoableMove)
    setOwnUndo(undefined)
  }

  // The person's own characters are drawn, and tapped, on top of any stack.
  const shown = useMemo(() => {
    const merged = withPending(mergeFog(mergeKnown(board, table.known), table.knownFog), pending)
    return { ...merged, tokens: ownTokensOnTop(merged.tokens, me.id) }
  }, [board, table.known, table.knownFog, pending, me.id])
  const instant = useMemo(() => new Set(pending.keys()), [pending])

  // Fog and spawn (stage 10). The session DM's "Spieleransicht" shows exactly what players
  // see: there `seen` is that board, and nothing can be selected, moved or sent.
  const dmFog = useDmFog({ campaignId, board: shown, grid, table, connected, running })
  const seen = dmFog.playerView ? dmFog.board : shown
  // Fog mode and placing creatures take the taps; the card and a selection wait meanwhile.
  const frozen = dmFog.modal || dmFog.playerView
  const current = currentControls(
    frozen ? IDLE : controls,
    seen.tokens,
    running && connected && !frozen,
  )
  const selected =
    current.mode === 'idle' ? null : seen.tokens.find((token) => token.id === current.tokenId)!
  const undoable = undoCandidate(ownUndo, board.undoableMove)
  const showUndo = isUndoVisible(undoable, seen.tokens, connected)
  const arrows = useMemo(
    () => moveArrows(table.previews, seen.tokens),
    [table.previews, seen.tokens],
  )

  const canMove = useCallback(
    (token: BoardToken) => !dmFog.playerView && canMoveToken(token, board, me.id),
    [board, me.id, dmFog.playerView],
  )
  // A selected token always has its card; a removed token's card closes by itself.
  const shownCard = dmFog.modal
    ? null
    : showCard(
        card ?? (selected ? { kind: 'token', tokenId: selected.id, cell: selected } : null),
        seen.tokens,
        scene,
        canMove,
        dmFog.unexplored,
      )
  const settledCard = cardWaiting ? null : shownCard
  const cardTokenId = settledCard?.kind === 'token' ? settledCard.token.id : null
  const pickerToken = picking ? seen.tokens.find((token) => token.id === picking) : undefined
  const covered = settledCard ? cardSize : null
  const inset = covered
    ? wide
      ? { right: covered.width + PANEL_GAP }
      : { bottom: covered.height }
    : undefined
  const bottomOverlay = covered && !wide ? covered.height : 0

  // While this device is at the confirm step, the others see an arrow to the target.
  // A confirmed move clears it on the server; letting go or losing the connection here.
  const previewing = current.mode === 'preview' ? current : null
  const [previewToken, previewX, previewY] = [
    previewing?.tokenId,
    previewing?.target.x,
    previewing?.target.y,
  ]
  const { preview } = table
  const previewShown = useRef(false)
  useEffect(() => {
    if (previewToken !== undefined && previewX !== undefined && previewY !== undefined) {
      // Sent once it has stood for a moment: the first tap of a double tap is taken back.
      const timer = setTimeout(() => {
        preview({ tokenId: previewToken, x: previewX, y: previewY })
        previewShown.current = true
      }, PREVIEW_SEND_DELAY_MS)
      return () => clearTimeout(timer)
    }
    if (previewShown.current) {
      previewShown.current = false
      // A held confirm keeps the others' preview until its move, which clears it on the server.
      if (!heldConfirm.current) preview(null)
    }
  }, [previewToken, previewX, previewY, preview])

  const fail = (code: ApiErrorCode | null, fallback: string) => {
    setNotice({ kind: 'error', text: code ? de.errors[code] : fallback })
    if (code && RELOAD_ON.includes(code)) table.reload()
  }

  /** Draws the token at the move's target until the server answers. */
  function showPending(token: BoardToken, intent: MoveIntent) {
    const elevation = placementElevation(grid, token.size, intent.x, intent.y)
    setPending((moves) => new Map(moves).set(token.id, { x: intent.x, y: intent.y, elevation }))
  }

  function dropPending(tokenId: string) {
    setPending((moves) => {
      if (!moves.has(tokenId)) return moves
      const next = new Map(moves)
      next.delete(tokenId)
      return next
    })
  }

  /** Shows the move at once and sends it after DOUBLE_TAP_MS, unless a double tap takes it back. */
  function holdConfirm(intent: MoveIntent) {
    const token = shown.tokens.find((candidate) => candidate.id === intent.tokenId)
    if (!token) return
    clearTimeout(heldConfirm.current?.timer)
    showPending(token, intent)
    const timer = setTimeout(() => {
      heldConfirm.current = null
      void send(intent)
    }, DOUBLE_TAP_MS)
    heldConfirm.current = { intent, timer }
  }

  async function send(intent: MoveIntent) {
    const token = shown.tokens.find((candidate) => candidate.id === intent.tokenId)
    if (!token) return
    const id = (sends.current.get(token.id) ?? 0) + 1
    sends.current.set(token.id, id)
    showPending(token, intent)
    try {
      const result = await table.move(intent)
      if (result.move) {
        table.apply(result.move)
        setOwnUndo({ tokenId: token.id, version: result.move.version })
        vibrate('taken')
      } else {
        vibrate('rejected')
        fail(result.error, t.moveFailed)
      }
    } catch {
      vibrate('rejected')
      fail(null, t.moveFailed)
    } finally {
      // The token stays where the newest known version puts it: the move's, or back.
      if (sends.current.get(token.id) === id) dropPending(token.id)
    }
  }

  async function undo() {
    setNotice(null)
    setOwnUndo(null)
    try {
      const result = await table.undo()
      if (result.move) {
        table.apply(result.move)
        vibrate('taken')
      } else fail(result.error, t.undoFailed)
    } catch {
      fail(null, t.undoFailed)
    }
  }

  function tap(cell: GridPoint, token?: BoardToken): boolean {
    beforeTap.current = { controls, notice, card }
    const result = tapBoard(
      current,
      { cell, token },
      {
        tokens: seen.tokens,
        grid,
        canMove,
        enabled: running && connected,
        card: shownCard && card,
        blocked: dmFog.blocked,
      },
    )
    setControls(result.controls)
    setCard(result.card)
    const opens = !shownCard && (result.card !== null || result.controls.mode !== 'idle')
    if (opens) {
      clearTimeout(cardTimer.current)
      setCardWaiting(true)
      cardTimer.current = setTimeout(() => setCardWaiting(false), DOUBLE_TAP_MS)
    }
    const hint =
      result.hint === 'invalidTarget'
        ? t.invalidTarget
        : result.hint === 'movingOff' && running
          ? t.movingOff
          : null
    setNotice(hint ? { kind: 'hint', text: hint } : null)
    if (result.confirm) holdConfirm(result.confirm)
    // The card shows tokens and cells: the board never needs its own info box here.
    return true
  }

  // The second touch of a double tap: the page goes back to how it was before the first,
  // the card the first tap opened included.
  function takeBackTap() {
    const held = heldConfirm.current
    if (held) {
      clearTimeout(held.timer)
      heldConfirm.current = null
      dropPending(held.intent.tokenId)
    }
    clearTimeout(cardTimer.current)
    setCardWaiting(false)
    const before = beforeTap.current
    beforeTap.current = null
    if (!before) return
    setControls(before.controls)
    setNotice(before.notice)
    setCard(before.card)
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

  const closeCard = useCallback(() => {
    setCard(null)
    setControls(IDLE)
    setNotice(null)
  }, [])

  // Escape closes the card and lets go of the selected token; a dialog over the page
  // (the status picker) closes first.
  const open = shownCard !== null || current.mode !== 'idle'
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return
      closeCard()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeCard])

  /** A status call's outcome: null when it went through (and is on the board), else why not. */
  async function statusCall(call: () => Promise<StatusResult>): Promise<string | null> {
    try {
      const result = await call()
      if (result.change) {
        table.applyStatuses(result.change)
        return null
      }
      if (result.error && RELOAD_ON.includes(result.error)) table.reload()
      return result.error ? de.errors[result.error] : de.tokenCard.statusFailed
    } catch {
      return connected ? de.tokenCard.statusFailed : de.tokenCard.needsConnection
    }
  }

  async function statusFromCard(call: () => Promise<StatusResult>) {
    setNotice(null)
    const error = await statusCall(call)
    if (error) setNotice({ kind: 'error', text: error })
  }

  async function removeToken(token: BoardToken) {
    setNotice(null)
    try {
      const result = await table.removeToken(token.id)
      if (result.error) fail(result.error, de.tokenCard.removeFailed)
      else setJustRemoved({ tokenId: token.id, label: token.label, at: Date.now() })
    } catch {
      fail(null, de.tokenCard.removeFailed)
    }
  }

  async function restoreToken(tokenId: string) {
    setNotice(null)
    setJustRemoved((current) => (current?.tokenId === tokenId ? null : current))
    try {
      const result = await table.restoreToken(tokenId)
      if (result.error) fail(result.error, de.tokenCard.restoreFailed)
    } catch {
      fail(null, de.tokenCard.restoreFailed)
    }
  }

  const hideJustRemoved = useCallback(() => setJustRemoved(null), [])

  // Pings and arrows need the table, like moving; offline a double tap only says so.
  function pingTarget(target: PingTarget) {
    if (!connected) {
      setNotice({ kind: 'hint', text: de.pings.offline })
      return
    }
    table.ping(pings.ping(target))
  }

  function drawArrow(from: PingTarget, to: GridPoint, done: boolean) {
    if (!connected) {
      if (done) setNotice({ kind: 'hint', text: de.pings.offline })
      return
    }
    const request = pings.arrow(from, to, done)
    if (request) table.drawArrow(request)
  }

  const dmActions = board.isSessionDm && running && (
    <>
      {dmFog.toolbar}
      <RemovedTokensMenu
        tokens={board.removedTokens}
        connected={connected}
        onRestore={(token) => void restoreToken(token.id)}
      />
    </>
  )

  return (
    <FightScreen
      campaignId={campaignId}
      title={board.name}
      status={table.status && <ConnectionIndicator status={table.status} />}
      actions={
        (dmActions || actions) && (
          <>
            {dmActions}
            {actions}
          </>
        )
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PresenceRow presence={board.presence} people={board.people} tokens={board.tokens} />
        <Board
          board={dmFog.board}
          fog={dmFog.fog}
          highlight={dmFog.highlight}
          faintTokenIds={dmFog.faintTokenIds}
          onCellTap={(cell) => dmFog.tapCell(cell) || tap(cell)}
          onTokenTap={(token, cell) => dmFog.tapToken(token, cell) || tap(cell, token)}
          selectedTokenId={selected?.id ?? null}
          ghost={
            current.mode === 'preview' ? { tokenId: current.tokenId, ...current.target } : null
          }
          arrows={arrows}
          slide
          instantTokenIds={instant}
          className="min-h-0 flex-1"
          onTapTakenBack={takeBackTap}
          onDoubleTap={pingTarget}
          onArrow={drawArrow}
          pings={pings.shown}
          inset={inset}
          keepInView={selected?.id ?? cardTokenId}
          handleRef={boardHandle}
        />

        {notice && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3"
            style={wide && covered ? { paddingRight: covered.width + PANEL_GAP * 2 } : undefined}
          >
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
          </div>
        )}

        {shownCard && (
          <div className="contents" style={cardWaiting ? { pointerEvents: 'none' } : undefined}>
            <TokenCard
              shown={shownCard}
              board={board}
              userId={me.id}
              controls={current}
              selected={selected}
              wide={wide}
              folded={folded}
              onFoldedChange={setFolded}
              onClose={closeCard}
              onConfirm={confirm}
              onCancel={cancel}
              live={{ running, connected }}
              canMove={canMove}
              onPickRow={(token) => {
                const picked = pickRow(current, token, shownCard.cell, {
                  canMove,
                  enabled: running && connected,
                })
                setControls(picked.controls)
                setCard(picked.card)
                setNotice(null)
              }}
              onAddStatus={(token) => setPicking(token.id)}
              onShow={(token) =>
                pingTarget({ cell: { x: token.x, y: token.y }, tokenId: token.id })
              }
              onRemoveToken={(token) => void removeToken(token)}
              fog={
                board.isSessionDm && running
                  ? { onSetHidden: dmFog.setTokensHidden, hiddenHere: dmFog.hiddenHere }
                  : undefined
              }
              onRemoveStatus={(token, statusId) =>
                void statusFromCard(() => table.removeStatus({ tokenId: token.id, statusId }))
              }
              onSetLevel={(token, statusId, level) =>
                void statusFromCard(() =>
                  table.setStatusLevel({ tokenId: token.id, statusId, level }),
                )
              }
              onSize={setCardSize}
            />
          </div>
        )}

        {dmFog.bars(bottomOverlay)}

        {pickerToken && running && (
          <StatusPicker
            campaignId={campaignId}
            encounterId={board.encounterId}
            label={pickerToken.label}
            statuses={pickerToken.statuses}
            canRemove={(status) => canRemoveStatus(status, board, me.id)}
            connected={connected}
            onAdd={(statusId) =>
              statusCall(() => table.addStatus({ tokenId: pickerToken.id, statusId, level: null }))
            }
            onRemove={(statusId) =>
              statusCall(() => table.removeStatus({ tokenId: pickerToken.id, statusId }))
            }
            onClose={() => setPicking(null)}
          />
        )}

        {running && (
          <MyCharacterButton
            tokens={shown.tokens}
            removedTokens={board.removedTokens}
            userId={me.id}
            board={boardHandle}
            // Above "Ganze Karte", which the board lifts above the docked card.
            style={{ bottom: bottomOverlay + 64 }}
          />
        )}

        {showUndo && (
          <Button
            onClick={() => void undo()}
            style={{ bottom: bottomOverlay + 12 }}
            className="absolute left-3 z-20 bg-panel/90 shadow-lg shadow-black/40"
          >
            <UndoIcon />
            {t.undo}
          </Button>
        )}

        {justRemoved && board.isSessionDm && running && (
          <UndoRemoveBar
            removed={justRemoved}
            // Above the move's "Rückgängig", which sits in the bottom-left corner.
            bottom={bottomOverlay + (showUndo ? 56 : 0)}
            connected={connected}
            onUndo={() => void restoreToken(justRemoved.tokenId)}
            onTimeout={hideJustRemoved}
          />
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
