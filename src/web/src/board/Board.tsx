// The battle map on screen (knowledge/features/playable-map.md): the plain layout
// rendering, the grid, features, entrances and tokens, with pinch-zoom, pan and
// fit-to-screen. Owned by the board renderer lane; this is the contract other
// screens build against.
//
// Drawing happens in two Konva layers, each one shape with plain canvas calls
// (render.ts): the map (terrain, highlight, grid, labels) and the tokens. With a loaded
// background picture the map layer draws the picture, highlight and grid instead
// (background.ts); until then, or if it fails, the plain rendering. Pan and zoom
// only change the stage transform and redraw; React re-renders only when the props or
// the info box change. Token images (tokenPictures.ts) load once per URL; a token shows
// its letter until its image is there. With `slide`, a token whose position changes glides to its new
// cell in about 200 ms (knowledge/decisions/realtime-sync.md): only the token layer
// redraws per animation frame, without a React render.
import type Konva from 'konva'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Layer, Shape, Stage } from 'react-konva'
import type { BoardState, BoardToken } from '../api/types'
import { de } from '../text/de'
import { footprint, stackCounts, tokenAt, tokensAt, type GridPoint } from './geometry'
import type { PingTarget, ShownPing } from './pings'
import { GestureTracker, wheelZoomFactor, type Gesture, type PointerSample } from './gestures'
import { drawPicture, mapLayers, useBackgroundImage } from './background'
import { cellInfo, tokenInfo } from './info'
import {
  drawGrid,
  drawHighlight,
  drawLabels,
  drawMapAtZoom,
  drawTokens,
  type Marker,
  type MoveArrow,
} from './render'
import { tokenMarks } from './palette'
import { buildHighlight, buildScene } from './scene'
import { useTokenPictures } from './tokenPictures'
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
   * Without this handler, or when it returns false, the board shows the cell's
   * terrain and elevation itself.
   */
  onCellTap?: (cell: GridPoint) => boolean | void
  /**
   * A tap on a token, with the tapped cell (a large token covers several). Without
   * this handler, or when it returns false, the board shows the token's details itself.
   */
  onTokenTap?: (token: BoardToken, cell: GridPoint) => boolean | void
  /** Cells shaded as targets, as cellKey(x, y) strings: free cells on the setup screen, reach in stage 4. */
  highlight?: ReadonlySet<string>
  /** A token drawn as selected. */
  selectedTokenId?: string | null
  /** A see-through copy of a token at another top-left cell: the preview of a move. */
  ghost?: { tokenId: string; x: number; y: number } | null
  /** Where others are about to move tokens: an arrow from each token to its target. */
  arrows?: readonly MoveArrow[]
  /** Tokens glide to a new position instead of jumping (not with reduced motion). */
  slide?: boolean
  /** Tokens that jump even with `slide`: the device's own move, already shown at its target. */
  instantTokenIds?: ReadonlySet<string>
  /** The board fills its container; the page gives it a size. */
  className?: string

  // ---- Stage 9 (knowledge/features/pings-and-arrows.md, token-card.md, player-extras.md) ----
  // Contract: the board renderer lane implements these.

  /**
   * The second touch of a double tap went down: the page undoes what the last tap did
   * (onCellTap or onTokenTap), so a double tap never selects, opens a card or confirms.
   * The board closes its own info box by itself.
   */
  onTapTakenBack?: () => void
  /** A double tap: ping the token drawn on top of the cell, or the cell. */
  onDoubleTap?: (target: PingTarget) => void
  /** A double tap dragged: an arrow from the first tap to `to`; `done` when the finger lifts. */
  onArrow?: (from: PingTarget, to: GridPoint, done: boolean) => void
  /** Pings and arrows to draw, with a marker at the screen's edge for those out of view. */
  pings?: readonly ShownPing[]
  /**
   * CSS pixels along the board's edges covered by the page's own overlays (the docked token
   * card): the board keeps its buttons, edge markers and `keepInView` clear of them.
   */
  inset?: { top?: number; right?: number; bottom?: number }
  /** A token to keep in view: when it lies under `inset`, the board pans just enough. */
  keepInView?: string | null
  /** For "Meine Figur": centre a token. */
  handleRef?: Ref<BoardHandle>
}

/** What a page can ask of the board. */
export interface BoardHandle {
  /**
   * Pans so the token stands in the middle of the uncovered board; zooms in to the
   * opening size if it is drawn smaller than a fingertip; with `pulse`, the token pulses
   * once in its ring colour. Doesn't select it. Nothing if it isn't on the board.
   */
  centerOn: (tokenId: string, options?: { pulse?: boolean }) => void
}

/** What the board's own info box is about. */
type InfoTarget =
  | { kind: 'cell'; x: number; y: number }
  /** The tapped cell: in a stack, the box names the other tokens on it. */
  | { kind: 'token'; id: string; cell: GridPoint }

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
  ghost,
  arrows,
  slide = false,
  instantTokenIds,
  className,
}: BoardProps) {
  const { width, height, layout, id: mapId, background } = board.map
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
      : infoToken && info?.kind === 'token'
        ? tokenInfo(
            infoToken,
            tokensAt(board.tokens, info.cell)
              .filter((token) => token.id !== infoToken.id)
              .map((token) => token.label),
          )
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
        if (onTokenTap && onTokenTap(token, cell) !== false) {
          setInfo(null)
        } else {
          setInfo((current) =>
            current?.kind === 'token' && current.id === token.id
              ? null
              : { kind: 'token', id: token.id, cell },
          )
        }
        return
      }
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < scene.width && cell.y < scene.height
      if (inside && onCellTap && onCellTap(cell) !== false) {
        setInfo(null)
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
      else if (gesture.type === 'pinch')
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

  const picture = useBackgroundImage(background?.url)
  // Kept per picture and frame, so a new board state with the same picture doesn't redraw.
  const bx = background?.x
  const by = background?.y
  const bw = background?.width
  const bh = background?.height
  const shownPicture = useMemo(
    () =>
      picture && bx !== undefined && by !== undefined && bw !== undefined && bh !== undefined
        ? { image: picture, frame: { x: bx, y: by, width: bw, height: bh } }
        : null,
    [picture, bx, by, bw, bh],
  )
  const drawMapShape = useCallback(
    (con: Konva.Context) => {
      const ctx = con._context
      const dpr = con.canvas.getPixelRatio()
      const layers = mapLayers(shownPicture !== null)
      if (layers.picture && shownPicture)
        drawPicture(ctx, shownPicture.image, shownPicture.frame, scene.width, scene.height)
      if (layers.plain) drawMapAtZoom(ctx, scene)
      if (layers.highlight && highlightScene)
        drawHighlight(ctx, highlightScene, scene, ctx.getTransform().a / dpr)
      if (layers.grid) drawGrid(ctx, scene, dpr, { onPicture: layers.picture })
      if (layers.labels) drawLabels(ctx, scene, dpr)
    },
    [scene, highlightScene, shownPicture],
  )

  const tokens = board.tokens
  const stacks = useMemo(() => stackCounts(tokens, selectedTokenId), [tokens, selectedTokenId])
  const marks = useMemo(() => tokenMarks(tokens), [tokens])
  // Each token image loads once; its arrival re-renders, which redraws the tokens.
  const images = useTokenPictures(useMemo(() => tokens.map((token) => token.imageUrl), [tokens]))
  const ghostToken = useMemo(() => {
    const token = ghost && tokens.find((t) => t.id === ghost.tokenId)
    return token ? { ...token, x: ghost.x, y: ghost.y } : null
  }, [ghost, tokens])

  // Slides: where each token stood at the last render, and the tokens on their way.
  const tokenLayerRef = useRef<Konva.Layer>(null)
  const lastPositions = useRef(new Map<string, GridPoint>())
  const slides = useRef(new Map<string, Slide>())
  const frame = useRef(0)

  useLayoutEffect(() => {
    const now = performance.now()
    const animate = slide && !prefersReducedMotion()
    const positions = new Map<string, GridPoint>()
    for (const token of tokens) {
      positions.set(token.id, { x: token.x, y: token.y })
      const before = lastPositions.current.get(token.id)
      if (!before || (before.x === token.x && before.y === token.y)) continue
      if (!animate || instantTokenIds?.has(token.id)) {
        slides.current.delete(token.id)
        continue
      }
      // From where it is drawn now, so a slide cut short by another move doesn't jump.
      const from = slidingAt(slides.current.get(token.id), before, now)
      slides.current.set(token.id, { fromX: from.x, fromY: from.y, start: now })
    }
    lastPositions.current = positions
    if (slides.current.size === 0 || frame.current) return
    const tick = () => {
      const time = performance.now()
      for (const [id, s] of slides.current)
        if (time - s.start >= SLIDE_MS) slides.current.delete(id)
      tokenLayerRef.current?.batchDraw()
      frame.current = slides.current.size > 0 ? requestAnimationFrame(tick) : 0
    }
    frame.current = requestAnimationFrame(tick)
  }, [tokens, slide, instantTokenIds])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    },
    [],
  )

  // A new function per render redraws the tokens; renders only follow prop or info changes.
  // Animation frames redraw the token layer with it, reading the slides from the ref.
  const drawTokenShape = (con: Konva.Context) => {
    const ctx = con._context
    const cssScale = ctx.getTransform().a / con.canvas.getPixelRatio()
    const now = performance.now()
    const drawn =
      slides.current.size > 0
        ? tokens.map((token) => {
            const at = slidingAt(slides.current.get(token.id), token, now)
            return at === token ? token : { ...token, x: at.x, y: at.y }
          })
        : tokens
    drawTokens(ctx, drawn, {
      selectedTokenId,
      cssScale,
      marker,
      ghost: ghostToken,
      arrows,
      stacks,
      marks,
      images,
    })
  }

  return (
    <div
      className={className}
      data-testid="board"
      data-background={shownPicture ? 'shown' : background ? 'plain' : undefined}
    >
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
              </Layer>
              <Layer ref={tokenLayerRef} listening={false}>
                <Shape sceneFunc={drawTokenShape} listening={false} />
              </Layer>
            </Stage>
          )}
        </div>

        {infoContent && (
          <div
            ref={infoRef}
            role="status"
            className="pointer-events-none absolute top-0 left-0 z-10 max-w-60 rounded-lg border border-line bg-panel px-3 py-2 shadow-lg shadow-black/40"
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

/** How long a token takes to glide to its new cell. */
export const SLIDE_MS = 200

/** A token gliding from (fromX, fromY), in cells, since `start` (performance.now()). */
interface Slide {
  fromX: number
  fromY: number
  start: number
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Where a token heading for `to` is drawn at `now`: `to` itself once the slide is over. */
function slidingAt<T extends GridPoint>(
  slide: Slide | undefined,
  to: T,
  now: number,
): T | GridPoint {
  if (!slide) return to
  const t = (now - slide.start) / SLIDE_MS
  if (t >= 1) return to
  const eased = 1 - (1 - Math.max(0, t)) ** 3
  return {
    x: slide.fromX + (to.x - slide.fromX) * eased,
    y: slide.fromY + (to.y - slide.fromY) * eased,
  }
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
