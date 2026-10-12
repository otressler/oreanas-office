// The battle map on screen (knowledge/features/playable-map.md): the plain layout
// rendering, the grid, features, entrances and tokens, with pinch-zoom, pan and
// fit-to-screen. Owned by the board renderer lane; this is the contract other
// screens build against.
//
// Drawing happens in two Konva shapes with plain canvas calls (render.ts): the map
// (terrain, highlight, grid, labels) and the tokens. Pan and zoom only change the
// stage transform and redraw; React re-renders only when the props or the info box change.
import type Konva from 'konva'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Layer, Shape, Stage } from 'react-konva'
import type { BoardState, BoardToken } from '../api/types'
import { de } from '../text/de'
import { footprint, tokenAt, type GridPoint } from './geometry'
import { GestureTracker, wheelZoomFactor, type Gesture, type PointerSample } from './gestures'
import { cellInfo, tokenInfo } from './info'
import {
  drawGrid,
  drawHighlight,
  drawLabels,
  drawMapAtZoom,
  drawTokens,
  type Marker,
} from './render'
import { buildHighlight, buildScene } from './scene'
import { useElementSize } from './useElementSize'
import {
  CELL,
  clampPan,
  fitViewport,
  keepCentre,
  screenToCell,
  worldSize,
  zoomAt,
  zoomLimits,
  type Point,
  type Size,
  type Viewport,
} from './viewport'

export interface BoardProps {
  board: BoardState
  /**
   * A tap on a cell: a short touch or click, never the end of a pan or pinch.
   * Without this handler the board shows the cell's terrain and elevation itself.
   */
  onCellTap?: (cell: GridPoint) => void
  /** A tap on a token. Without this handler the board shows the token's details itself. */
  onTokenTap?: (token: BoardToken) => void
  /** Cells shaded as targets, as cellKey(x, y) strings: free cells on the setup screen, reach in stage 4. */
  highlight?: ReadonlySet<string>
  /** A token drawn as selected. */
  selectedTokenId?: string | null
  /** The board fills its container; the page gives it a size. */
  className?: string
}

/** What the board's own info box is about. */
type InfoTarget = { kind: 'cell'; x: number; y: number } | { kind: 'token'; id: string }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Safari's own pinch events (macOS trackpads); not in the DOM typings. */
interface SafariGestureEvent extends UIEvent {
  scale: number
  clientX: number
  clientY: number
}

export function Board({
  board,
  onCellTap,
  onTokenTap,
  highlight,
  selectedTokenId,
  className,
}: BoardProps) {
  const { width, height, layout, id: mapId } = board.map
  const surfaceRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const infoRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(surfaceRef)

  const scene = useMemo(() => buildScene({ width, height, layout }), [width, height, layout])
  const highlightScene = useMemo(
    () => buildHighlight(highlight, width, height),
    [highlight, width, height],
  )

  const [info, setInfo] = useState<InfoTarget | null>(null)
  const infoToken =
    info?.kind === 'token' ? board.tokens.find((token) => token.id === info.id) : undefined
  const infoContent =
    info?.kind === 'cell'
      ? cellInfo(scene, info.x, info.y)
      : infoToken
        ? tokenInfo(infoToken)
        : null
  const marker: Marker | null =
    info?.kind === 'cell' && infoContent
      ? { x: info.x, y: info.y, size: 1 }
      : infoToken
        ? { x: infoToken.x, y: infoToken.y, size: footprint(infoToken.size) }
        : null

  // The viewport lives outside React state: gestures update the stage directly.
  const view = useRef<Viewport | null>(null)
  const screen = useRef<Size | null>(null)
  /** Still showing the fitted map: a resize or rotation fits it again. */
  const fitted = useRef(true)
  const mapKey = useRef('')
  const markerRef = useRef<Marker | null>(null)

  /** Places the info box above the marked cell or token (below it near the top edge). */
  const positionInfo = useCallback(() => {
    const box = infoRef.current
    const v = view.current
    const s = screen.current
    const m = markerRef.current
    if (!box || !v || !s || !m) return
    const gap = 8
    const left = v.x + m.x * CELL * v.scale
    const top = v.y + m.y * CELL * v.scale
    const span = m.size * CELL * v.scale
    const w = box.offsetWidth
    const h = box.offsetHeight
    const x = clamp(left + span / 2 - w / 2, gap, s.width - w - gap)
    const above = top - h - gap
    const y = clamp(above >= gap ? above : top + span + gap, gap, s.height - h - gap)
    box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }, [])

  const applyView = useCallback(
    (next: Viewport) => {
      view.current = next
      const stage = stageRef.current
      if (stage) {
        stage.scale({ x: next.scale, y: next.scale })
        stage.position({ x: next.x, y: next.y })
        stage.batchDraw()
      }
      positionInfo()
    },
    [positionInfo],
  )

  const fit = useCallback(() => {
    const s = screen.current
    if (!s) return
    fitted.current = true
    applyView(fitViewport(worldSize(width, height), s))
  }, [applyView, width, height])

  // First fit, a new map, and resizes: refit while fitted, else keep the centre.
  useLayoutEffect(() => {
    if (!size) return
    const world = worldSize(width, height)
    const key = `${mapId}:${width}x${height}`
    const before = screen.current
    screen.current = size
    const keep = view.current && before && !fitted.current && key === mapKey.current
    mapKey.current = key
    if (keep) applyView(keepCentre(view.current!, before!, size, world))
    else {
      fitted.current = true
      applyView(fitViewport(world, size))
    }
  }, [size, width, height, mapId, applyView])

  useLayoutEffect(() => {
    markerRef.current = marker
    positionInfo()
  })

  // Gestures read the latest props through a ref, so the listeners stay attached.
  const latest = useRef({ board, scene, onCellTap, onTokenTap, selectedTokenId })
  useLayoutEffect(() => {
    latest.current = { board, scene, onCellTap, onTokenTap, selectedTokenId }
  })

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const tracker = new GestureTracker()

    const local = (e: { clientX: number; clientY: number }): Point => {
      const rect = surface.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const sample = (e: PointerEvent): PointerSample => ({
      id: e.pointerId,
      ...local(e),
      time: e.timeStamp,
      kind: e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch',
    })

    const transform = (change: (v: Viewport, world: Size, s: Size) => Viewport) => {
      const v = view.current
      const s = screen.current
      if (!v || !s) return
      const { scene } = latest.current
      const world = worldSize(scene.width, scene.height)
      fitted.current = false
      applyView(clampPan(change(v, world, s), world, s))
    }

    const tap = (point: Point) => {
      const v = view.current
      if (!v) return
      const { board, scene, onCellTap, onTokenTap, selectedTokenId } = latest.current
      const cell = screenToCell(v, point)
      const token = tokenAt(board.tokens, cell, selectedTokenId)
      if (token) {
        if (onTokenTap) {
          setInfo(null)
          onTokenTap(token)
        } else {
          setInfo((current) =>
            current?.kind === 'token' && current.id === token.id
              ? null
              : { kind: 'token', id: token.id },
          )
        }
        return
      }
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < scene.width && cell.y < scene.height
      if (inside && onCellTap) {
        setInfo(null)
        onCellTap(cell)
        return
      }
      // Tapping void, outside the map or the same cell again closes the box.
      if (!inside || !cellInfo(scene, cell.x, cell.y)) {
        setInfo(null)
        return
      }
      setInfo((current) =>
        current?.kind === 'cell' && current.x === cell.x && current.y === cell.y
          ? null
          : { kind: 'cell', x: cell.x, y: cell.y },
      )
    }

    const run = (gesture: Gesture | null) => {
      if (!gesture) return
      if (gesture.type === 'tap') tap(gesture.point)
      else if (gesture.type === 'pan')
        transform((v) => ({ ...v, x: v.x + gesture.dx, y: v.y + gesture.dy }))
      else
        transform((v, world, s) => {
          const zoomed = zoomAt(v, gesture.center, gesture.factor, zoomLimits(world, s))
          return { ...zoomed, x: zoomed.x + gesture.dx, y: zoomed.y + gesture.dy }
        })
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      // No text selection, focus changes or emulated mouse events from the board.
      e.preventDefault()
      try {
        surface.setPointerCapture(e.pointerId)
      } catch {
        // Capturing is a nicety (drags that leave the board); taps work without it.
      }
      tracker.down(sample(e))
    }
    const onPointerMove = (e: PointerEvent) => run(tracker.move(sample(e)))
    const onPointerUp = (e: PointerEvent) => run(tracker.up(sample(e)))
    const onPointerCancel = (e: PointerEvent) => tracker.cancel(e.pointerId)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const point = local(e)
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey)
      transform((v, world, s) => zoomAt(v, point, factor, zoomLimits(world, s)))
    }
    // Safari on macOS pinches with gesture events. On iPhones they come alongside the
    // pointer events the tracker already handles, so only use them with no pointer down.
    let gestureScale = 1
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      gestureScale = 1
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const gesture = e as SafariGestureEvent
      if (tracker.active || !gesture.scale) return
      const factor = gesture.scale / gestureScale
      gestureScale = gesture.scale
      const point = local(gesture)
      transform((v, world, s) => zoomAt(v, point, factor, zoomLimits(world, s)))
    }
    const prevent = (e: Event) => e.preventDefault()

    const listeners: [string, (e: never) => void, AddEventListenerOptions?][] = [
      ['pointerdown', onPointerDown],
      ['pointermove', onPointerMove],
      ['pointerup', onPointerUp],
      ['pointercancel', onPointerCancel],
      ['lostpointercapture', onPointerCancel],
      ['wheel', onWheel, { passive: false }],
      // Belt and braces next to touch-action: none, for browsers that still scroll or zoom.
      ['touchmove', prevent, { passive: false }],
      ['gesturestart', onGestureStart, { passive: false }],
      ['gesturechange', onGestureChange, { passive: false }],
      ['contextmenu', prevent],
    ]
    for (const [type, listener, options] of listeners)
      surface.addEventListener(type, listener as EventListener, options)
    return () => {
      for (const [type, listener, options] of listeners)
        surface.removeEventListener(type, listener as EventListener, options)
    }
  }, [applyView])

  // Escape closes the info box.
  useEffect(() => {
    if (!info) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfo(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [info])

  const drawMapShape = useCallback(
    (con: Konva.Context) => {
      const ctx = con._context
      const dpr = con.canvas.getPixelRatio()
      drawMapAtZoom(ctx, scene)
      if (highlightScene) drawHighlight(ctx, highlightScene, scene, ctx.getTransform().a / dpr)
      drawGrid(ctx, scene, dpr)
      drawLabels(ctx, scene, dpr)
    },
    [scene, highlightScene],
  )

  const tokens = board.tokens
  // A new function per render redraws the tokens; renders only follow prop or info changes.
  const drawTokenShape = (con: Konva.Context) => {
    const ctx = con._context
    const cssScale = ctx.getTransform().a / con.canvas.getPixelRatio()
    drawTokens(ctx, tokens, { selectedTokenId, cssScale, marker })
  }

  return (
    <div className={className} data-testid="board">
      <div
        className="relative h-full w-full overflow-hidden bg-table"
        role="region"
        aria-label={de.board.label(board.name)}
      >
        <div
          ref={surfaceRef}
          className="absolute inset-0 touch-none overscroll-contain select-none [-webkit-touch-callout:none]"
          data-board-surface=""
        >
          {size && size.width > 0 && size.height > 0 && (
            <Stage ref={stageRef} width={size.width} height={size.height} listening={false}>
              <Layer listening={false}>
                <Shape sceneFunc={drawMapShape} listening={false} />
                <Shape sceneFunc={drawTokenShape} listening={false} />
              </Layer>
            </Stage>
          )}
        </div>

        {infoContent && (
          <div
            ref={infoRef}
            role="status"
            className="pointer-events-none absolute top-0 left-0 z-10 max-w-60 rounded-lg border border-line bg-panel/95 px-3 py-2 shadow-lg shadow-black/40"
          >
            <p className="leading-snug font-semibold text-parchment">{infoContent.title}</p>
            {infoContent.details.map((line) => (
              <p key={line} className="text-sm leading-snug text-dim">
                {line}
              </p>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={fit}
          className="absolute right-3 bottom-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel/90 px-3 text-sm text-parchment shadow-lg shadow-black/40 hover:border-candle"
        >
          <FitIcon />
          {de.board.fit}
        </button>
      </div>
    </div>
  )
}

/** Four corners pointing outwards. */
function FitIcon() {
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
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}
