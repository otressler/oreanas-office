// The controls of a shared screen in local mode (knowledge/features/shared-table.md): the
// tablet in the middle of the table moves every character, opens the token card, points
// in white as "Tisch", puts statuses on and undoes its own last move. A layer over the
// spectator screen: it draws the interactive board over the watching one, which the
// spectator screen switches on only when the device was opened as a shared screen. The
// pieces are FightTable's (controls.ts, TokenCard, StatusPicker, usePings, Board); only
// the rules differ: every character counts as the person's own and no creature moves.
// When the session DM switches back to "Eigene Geräte" it lets go of its selection, takes
// its preview back and renders nothing, so the spectator screen's board only watches again.
import type { HubConnection } from '@microsoft/signalr'
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { ApiErrorCode, BoardState, BoardToken, PlayMode, UndoableMove } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { Board, type BoardHandle } from '../board/Board'
import { buildGrid, placementElevation, type GridPoint } from '../board/geometry'
import { DOUBLE_TAP_MS } from '../board/gestures'
import type { PingTarget } from '../board/pings'
import { buildScene } from '../board/scene'
import { Button } from '../components/ui'
import { useWideScreen } from '../lib/useWideScreen'
import { canRemoveStatus } from '../statuses/rules'
import { StatusPicker } from '../statuses/StatusPicker'
import { PREVIEW_SEND_DELAY_MS } from '../table/FightTable'
import {
  IDLE,
  confirmPreview,
  currentControls,
  pickRow,
  tapBoard,
  type Card,
  type Controls,
  type MoveIntent,
} from '../table/controls'
import { invokeHub, onHubEvent } from '../table/hub'
import {
  mergeKnown,
  rememberMove,
  withPending,
  type KnownPositions,
  type PendingMoves,
} from '../table/merge'
import {
  NO_PREVIEWS,
  moveArrows,
  withPreview,
  withoutPreview,
  type Previews,
} from '../table/previews'
import { isUndoVisible, undoCandidate } from '../table/undo'
import { usePings } from '../table/usePings'
import { de } from '../text/de'
import { showCard } from '../tokenCard/card'
import { TokenCard } from '../tokenCard/TokenCard'
import { canMoveAsTable, charactersOnTop, hasControls } from './rules'

const t = de.table

export interface SharedScreenControlsProps {
  encounterId: string
  /** The board as the players' view of the fight (?view=player&sharedScreen=true), kept current by the screen. */
  board: BoardState
  /** The screen's table connection, already joined to the encounter as a shared screen. */
  connection: HubConnection | null
  /** For "Ganze Karte" in the spectator screen's corner menu: the board's own handle. */
  handleRef?: Ref<BoardHandle>
}

interface Notice {
  kind: 'hint' | 'error'
  text: string
}

/** Errors after which the board itself has changed: the fight ended or the token is gone. */
const GONE: readonly ApiErrorCode[] = ['encounterNotActive', 'tokenNotFound']

/** Gap between the board's edge and the card's panel on wide screens. */
const PANEL_GAP = 12

export function SharedScreenControls({
  encounterId,
  board,
  connection,
  handleRef,
}: SharedScreenControlsProps) {
  const me = useCurrentUser()
  const wide = useWideScreen()
  const pings = usePings(board, me.id, true)
  const grid = useMemo(() => buildGrid(board.map), [board.map])
  const scene = useMemo(() => buildScene(board.map), [board.map])

  // The play mode: the board's, then whatever PlayModeChanged says since.
  const [playMode, setPlayMode] = useState<PlayMode>(board.playMode)
  const [boardMode, setBoardMode] = useState(board.playMode)
  if (boardMode !== board.playMode) {
    setBoardMode(board.playMode)
    setPlayMode(board.playMode)
  }
  const [previews, setPreviews] = useState<Previews>(NO_PREVIEWS)
  const [known, setKnown] = useState<KnownPositions>(() => new Map())
  const [pending, setPending] = useState<PendingMoves>(() => new Map())
  const sends = useRef(new Map<string, number>())
  const [controls, setControls] = useState<Controls>(IDLE)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [folded, setFolded] = useState(false)
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const beforeTap = useRef<{ controls: Controls; notice: Notice | null; card: Card | null } | null>(
    null,
  )
  const heldConfirm = useRef<{ intent: MoveIntent; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  )
  useEffect(() => () => clearTimeout(heldConfirm.current?.timer), [])
  const [cardWaiting, setCardWaiting] = useState(false)
  const cardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(cardTimer.current), [])

  const local = hasControls(playMode)
  const running = board.status === 'active'
  const connected = connection !== null
  const enabled = local && running && connected

  // The hub's messages that only this layer needs: others' pings, arrows and previews, the
  // moves this device made itself (so a move shows at once) and the play mode.
  const { events: pingEvents } = pings
  useEffect(() => {
    if (!connection) return
    const off = [
      onHubEvent(connection, 'Pinged', (ping) => pingEvents.onPinged?.(ping)),
      onHubEvent(connection, 'ArrowDrawn', (arrow) => pingEvents.onArrowDrawn?.(arrow)),
      onHubEvent(connection, 'MovePreviewed', (preview) =>
        setPreviews((current) => withPreview(current, preview)),
      ),
      onHubEvent(connection, 'MovePreviewCleared', (cleared) =>
        setPreviews((current) => withoutPreview(current, cleared)),
      ),
      onHubEvent(connection, 'TokenMoved', (move) =>
        setKnown((current) => rememberMove(current, move)),
      ),
      onHubEvent(connection, 'PlayModeChanged', (changed) => setPlayMode(changed.playMode)),
    ]
    return () => {
      off.forEach((unsubscribe) => unsubscribe())
      setPreviews(NO_PREVIEWS)
    }
  }, [connection, pingEvents])

  // Switched back to "Eigene Geräte": let go of the selected token, take the preview back
  // and close what is open. The screen only watches from here on.
  const [wasLocal, setWasLocal] = useState(local)
  if (wasLocal !== local) {
    setWasLocal(local)
    if (!local) {
      setControls(IDLE)
      setCard(null)
      setNotice(null)
      setPicking(null)
      setPending(new Map())
    }
  }
  useEffect(() => {
    if (local) return
    clearTimeout(heldConfirm.current?.timer)
    heldConfirm.current = null
    if (connection) void invokeHub(connection, 'ClearPreview').catch(() => {})
  }, [local, connection])

  const shown = useMemo(() => {
    const merged = withPending(mergeKnown(board, known), pending)
    return { ...merged, tokens: charactersOnTop(merged.tokens) }
  }, [board, known, pending])
  const instant = useMemo(() => new Set(pending.keys()), [pending])
  const current = currentControls(controls, shown.tokens, enabled)
  const selected =
    current.mode === 'idle' ? null : shown.tokens.find((token) => token.id === current.tokenId)!
  const arrows = useMemo(() => moveArrows(previews, shown.tokens), [previews, shown.tokens])

  // The device's own undo; a reload that brings a new `undoableMove` takes over again.
  const [ownUndo, setOwnUndo] = useState<UndoableMove | null | undefined>(undefined)
  const [boardUndo, setBoardUndo] = useState(board.undoableMove)
  if (boardUndo !== board.undoableMove) {
    setBoardUndo(board.undoableMove)
    setOwnUndo(undefined)
  }
  const undoable = undoCandidate(ownUndo, board.undoableMove)
  const showUndo = enabled && isUndoVisible(undoable, shown.tokens, connected)

  const shownCard = showCard(
    card ?? (selected ? { kind: 'token', tokenId: selected.id, cell: selected } : null),
    shown.tokens,
    scene,
    canMoveAsTable,
  )
  const settledCard = cardWaiting ? null : shownCard
  const cardTokenId = settledCard?.kind === 'token' ? settledCard.token.id : null
  const pickerToken = picking ? shown.tokens.find((token) => token.id === picking) : undefined
  const covered = settledCard ? cardSize : null
  const inset = covered
    ? wide
      ? { right: covered.width + PANEL_GAP }
      : { bottom: covered.height }
    : undefined
  const bottomOverlay = covered && !wide ? covered.height : 0

  // While this screen is at the confirm step, the others see an arrow to the target.
  const previewing = current.mode === 'preview' ? current : null
  const [previewToken, previewX, previewY] = [
    previewing?.tokenId,
    previewing?.target.x,
    previewing?.target.y,
  ]
  const previewShown = useRef(false)
  useEffect(() => {
    if (!connection) return
    if (previewToken !== undefined && previewX !== undefined && previewY !== undefined) {
      const timer = setTimeout(() => {
        void invokeHub(connection, 'PreviewMove', {
          tokenId: previewToken,
          x: previewX,
          y: previewY,
        }).catch(() => {})
        previewShown.current = true
      }, PREVIEW_SEND_DELAY_MS)
      return () => clearTimeout(timer)
    }
    if (previewShown.current) {
      previewShown.current = false
      if (!heldConfirm.current) void invokeHub(connection, 'ClearPreview').catch(() => {})
    }
  }, [connection, previewToken, previewX, previewY])

  const fail = (code: ApiErrorCode | null, fallback: string) => {
    setNotice({ kind: 'error', text: code ? de.errors[code] : fallback })
  }

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
    if (!token || !connection) return
    const id = (sends.current.get(token.id) ?? 0) + 1
    sends.current.set(token.id, id)
    showPending(token, intent)
    try {
      const result = await invokeHub(connection, 'MoveToken', intent)
      if (result.move) {
        setKnown((known) => rememberMove(known, result.move!))
        setOwnUndo({ tokenId: token.id, version: result.move.version })
      } else fail(result.error, t.moveFailed)
    } catch {
      fail(null, t.moveFailed)
    } finally {
      if (sends.current.get(token.id) === id) dropPending(token.id)
    }
  }

  async function undo() {
    if (!connection) return
    setNotice(null)
    setOwnUndo(null)
    try {
      const result = await invokeHub(connection, 'UndoMove', encounterId)
      if (result.move) setKnown((known) => rememberMove(known, result.move!))
      else fail(result.error, t.undoFailed)
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
        tokens: shown.tokens,
        grid,
        canMove: canMoveAsTable,
        enabled,
        card: shownCard && card,
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
    return true
  }

  // The second touch of a double tap: back to how it was before the first.
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

  /** A status call's outcome: null when it went through, else why not. The event updates the board. */
  async function statusCall(
    method: 'AddStatus' | 'RemoveStatus' | 'SetStatusLevel',
    request: { tokenId: string; statusId: string; level?: number | null },
  ): Promise<string | null> {
    if (!connection) return de.tokenCard.needsConnection
    try {
      const result =
        method === 'AddStatus'
          ? await invokeHub(connection, 'AddStatus', {
              tokenId: request.tokenId,
              statusId: request.statusId,
              level: request.level ?? null,
            })
          : method === 'RemoveStatus'
            ? await invokeHub(connection, 'RemoveStatus', {
                tokenId: request.tokenId,
                statusId: request.statusId,
              })
            : await invokeHub(connection, 'SetStatusLevel', {
                tokenId: request.tokenId,
                statusId: request.statusId,
                level: request.level ?? 1,
              })
      if (result.change) return null
      if (result.error && GONE.includes(result.error)) setPicking(null)
      return result.error ? de.errors[result.error] : de.tokenCard.statusFailed
    } catch {
      return de.tokenCard.statusFailed
    }
  }

  async function statusFromCard(
    method: 'RemoveStatus' | 'SetStatusLevel',
    request: { tokenId: string; statusId: string; level?: number },
  ) {
    setNotice(null)
    const error = await statusCall(method, request)
    if (error) setNotice({ kind: 'error', text: error })
  }

  // Pings and arrows are the table's: white, named "Tisch".
  function pingTarget(target: PingTarget) {
    if (!connection) {
      setNotice({ kind: 'hint', text: de.pings.offline })
      return
    }
    const request = pings.ping(target)
    void invokeHub(connection, 'Ping', { encounterId, ...request }).catch(() => {})
  }

  function drawArrow(from: PingTarget, to: GridPoint, done: boolean) {
    if (!connection) {
      if (done) setNotice({ kind: 'hint', text: de.pings.offline })
      return
    }
    const request = pings.arrow(from, to, done)
    if (request)
      void invokeHub(connection, 'DrawArrow', { encounterId, ...request }).catch(() => {})
  }

  // Back in "Eigene Geräte": nothing to show over the spectator screen's board.
  if (!local) return null

  return (
    <div
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-table"
      data-testid="shared-screen"
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
          handleRef={handleRef}
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
              sharedScreen
              controls={current}
              selected={selected}
              wide={wide}
              folded={folded}
              onFoldedChange={setFolded}
              onClose={closeCard}
              onConfirm={confirm}
              onCancel={cancel}
              live={{ running: running && local, connected }}
              canMove={canMoveAsTable}
              onPickRow={(token) => {
                const picked = pickRow(current, token, shownCard.cell, {
                  canMove: canMoveAsTable,
                  enabled,
                })
                setControls(picked.controls)
                setCard(picked.card)
                setNotice(null)
              }}
              onAddStatus={(token) => setPicking(token.id)}
              onShow={(token) =>
                pingTarget({ cell: { x: token.x, y: token.y }, tokenId: token.id })
              }
              onRemoveToken={() => {}}
              onRemoveStatus={(token, statusId) =>
                void statusFromCard('RemoveStatus', { tokenId: token.id, statusId })
              }
              onSetLevel={(token, statusId, level) =>
                void statusFromCard('SetStatusLevel', { tokenId: token.id, statusId, level })
              }
              onSize={setCardSize}
            />
          </div>
        )}

        {pickerToken && running && (
          <StatusPicker
            campaignId={board.campaignId}
            encounterId={board.encounterId}
            sharedScreen
            label={pickerToken.label}
            statuses={pickerToken.statuses}
            canRemove={(status) => canRemoveStatus(status, board, me.id, true)}
            connected={connected}
            onAdd={(statusId) =>
              statusCall('AddStatus', { tokenId: pickerToken.id, statusId, level: null })
            }
            onRemove={(statusId) =>
              statusCall('RemoveStatus', { tokenId: pickerToken.id, statusId })
            }
            onClose={() => setPicking(null)}
          />
        )}

        {showUndo && (
          <Button
            onClick={() => void undo()}
            style={{ bottom: bottomOverlay + 12 }}
            className="absolute left-3 z-20 bg-panel/90 shadow-lg shadow-black/40"
          >
            {t.undo}
          </Button>
        )}
      </div>
    </div>
  )
}
