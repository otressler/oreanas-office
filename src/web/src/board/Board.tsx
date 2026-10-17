// The battle map on screen (knowledge/features/playable-map.md): the plain layout
// rendering, the grid, features, entrances and tokens, with pinch-zoom, pan and
// fit-to-screen. Owned by the board renderer lane; this is the contract other
// screens build against.
//
// Drawing happens in three Konva layers, each one shape with plain canvas calls
// (render.ts, pingRender.ts): the map (terrain, highlight, grid, labels), the tokens with
// their status badges, and pings and arrows. With a loaded background picture the map
// layer draws the picture, highlight and grid instead (background.ts); until then, or if
// it fails, the plain rendering. Pan and zoom only change the stage transform and redraw;
// React re-renders only when the props or the info box change. Token images and status
// icons (tokenPictures.ts) load once per URL; a token shows its letter until its image is
// there. With `slide`, a token whose position changes glides to its new cell in about
// 200 ms (knowledge/decisions/realtime-sync.md), and a token that leaves the board fades
// out, one that comes back fades in (knowledge/features/removing-tokens.md). Pings pulse,
// arrows fade (knowledge/features/pings-and-arrows.md). All animation runs on
// requestAnimationFrame while something moves, redrawing only the layers that change,
// without a React render; reduced motion turns it off.
import type Konva from 'konva'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react'
import { Layer, Shape, Stage } from 'react-konva'
import type { BoardState, BoardToken, StatusDefinition } from '../api/types'
import { de } from '../text/de'
import { footprint, stackCounts, tokenAt, tokensAt, type GridPoint } from './geometry'
import { pingExpired, type PingTarget, type ShownPing } from './pings'
import { GestureTracker, wheelZoomFactor, type Gesture, type PointerSample } from './gestures'
import { drawPicture, mapLayers, useBackgroundImage } from './background'
import { cellInfo, tokenInfo } from './info'
import {
  centredOn,
  edgeMarker,
  keptInView,
  MARKER_MARGIN,
  panTo,
  uncoveredArea,
  type Inset,
} from './overlay'
import {
  drawPings,
  drawPulse,
  pingAnimates,
  pingPoints,
  PULSE_MS,
  type PlacedToken,
} from './pingRender'
import {
  drawGrid,
  drawHighlight,
  drawLabels,
  drawMapAtZoom,
  drawTokens,
  type Marker,
  type MoveArrow,
} from './render'
import { ringColor, tokenMarks } from './palette'
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
  worldToScreen,
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
  /**
   * Tokens glide to a new position instead of jumping, and fade out when they leave the
   * board and in when they come back (not with reduced motion).
   */
  slide?: boolean
  /** Tokens that jump even with `slide`: the device's own move, already shown at its target. */
  instantTokenIds?: ReadonlySet<string>
  /** The board fills its container; the page gives it a size. */
  className?: string

  // ---- Stage 9 (knowledge/features/pings-and-arrows.md, token-card.md, player-extras.md) ----

  /**
   * The second touch of a double tap went down: the page undoes what the last tap did
   * (onCellTap or onTokenTap), so a double tap never selects, opens a card or confirms.
   * The board closes its own info box by itself.
   */
  onTapTakenBack?: () => void
  /**
   * A double tap: ping the token drawn on top of the cell, or the cell. With this or
   * onArrow set, the board tells double taps from taps and shows the hint about them once.
   */
  onDoubleTap?: (target: PingTarget) => void
  /** A double tap dragged: an arrow from the first tap to `to`; `done` when the finger lifts. */
  onArrow?: (from: PingTarget, to: GridPoint, done: boolean) => void
  /** Pings and arrows to draw, with a marker at the screen's edge for those out of view. */
  pings?: readonly ShownPing[]
  /**
   * CSS pixels along the board's edges covered by the page's own overlays (the docked token
   * card): the board keeps its buttons, edge markers and `keepInView` clear of them.
   */
  inset?: Inset
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
  /** Zooms out until the whole map fits ("Ganze Karte"), as the board's own button does. Missing on test doubles. */
  fit?: () => void
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

/** Room for the buttons along the board's bottom edge, in CSS pixels. */
const EDGE = 12
/** The hint sits above the bottom row of buttons ("Ganze Karte", "Rückgängig"). */
const HINT_BOTTOM = 64
/** The right-hand column of buttons the hint keeps clear of ("Ganze Karte", "Meine Figur"). */
const HINT_RIGHT = 152

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
  onTapTakenBack,
  onDoubleTap,
  onArrow,
  pings,
  inset,
  keepInView,
  handleRef,
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

  const tokens = board.tokens
  // What the animation frames and the ping layer read: the latest props.
  const tokensRef = useRef(tokens)
  const pingsRef = useRef<readonly ShownPing[]>(pings ?? [])
  const insetRef = useRef(inset)
  useLayoutEffect(() => {
    tokensRef.current = tokens
    pingsRef.current = pings ?? []
    insetRef.current = inset
  })

  // Slides: where each token stood at the last render, and the tokens on their way.
  const tokenLayerRef = useRef<Konva.Layer>(null)
  const pingLayerRef = useRef<Konva.Layer>(null)
  const lastTokens = useRef(new Map<string, BoardToken>())
  const lastBoard = useRef<string | null>(null)
  const slides = useRef(new Map<string, Slide>())
  const fades = useRef(new Map<string, Fade>())
  const pulses = useRef(new Map<string, Pulse>())
  const frame = useRef(0)
  /** What the last animation frame redrew, so the frame after it draws the end state. */
  const animating = useRef({ tokens: false, pings: false })
  const markerEls = useRef(new Map<string, HTMLButtonElement>())

  /** Where a token is drawn now, slides included: pings follow it. */
  const placedToken = useCallback((tokenId: string): PlacedToken | undefined => {
    const token = tokensRef.current.find((candidate) => candidate.id === tokenId)
    if (!token) return undefined
    const at = slidingAt(slides.current.get(token.id), token, performance.now())
    return { x: at.x, y: at.y, size: token.size }
  }, [])

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

  /** Puts a marker at the edge for every ping out of view, and hides the others. */
  const positionMarkers = useCallback(() => {
    const v = view.current
    const s = screen.current
    if (!v || !s || markerEls.current.size === 0) return
    const area = uncoveredArea(s, insetRef.current)
    const now = performance.now()
    for (const ping of pingsRef.current) {
      const element = markerEls.current.get(ping.id)
      if (!element) continue
      const points = pingExpired(ping, now) ? null : pingPoints(ping, placedToken)
      const edge =
        points &&
        edgeMarker(
          worldToScreen(v, points.target),
          area,
          MARKER_MARGIN,
          points.visible.map((point) => worldToScreen(v, point)),
        )
      if (!edge) {
        element.style.display = 'none'
        continue
      }
      element.style.display = 'flex'
      element.style.transform = `translate(${Math.round(edge.x - MARKER_SIZE / 2)}px, ${Math.round(edge.y - MARKER_SIZE / 2)}px)`
      const pointer = element.firstElementChild as HTMLElement | null
      if (pointer) pointer.style.transform = `rotate(${edge.angle}rad)`
    }
  }, [placedToken])

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
      positionMarkers()
    },
    [positionInfo, positionMarkers],
  )

  /** Moves the view, kept within bounds; the map isn't fitted any more. */
  const moveView = useCallback(
    (next: Viewport) => {
      const s = screen.current
      if (!s) return
      fitted.current = false
      applyView(clampPan(next, worldSize(width, height), s))
    },
    [applyView, width, height],
  )

  const fit = useCallback(() => {
    const s = screen.current
    if (!s) return
    fitted.current = true
    applyView(fitViewport(worldSize(width, height), s))
  }, [applyView, width, height])

  // One animation loop for slides, fades, pulsing pings, fading arrows and pulses.
  const tick = useCallback(
    function tick() {
      frame.current = 0
      const now = performance.now()
      const motion = !prefersReducedMotion()
      for (const [id, s] of slides.current) if (now - s.start >= SLIDE_MS) slides.current.delete(id)
      for (const [id, f] of fades.current) if (now - f.start >= FADE_MS) fades.current.delete(id)
      for (const [id, p] of pulses.current) if (now - p.start >= PULSE_MS) pulses.current.delete(id)
      const shown = pingsRef.current
      const tokensMove = slides.current.size > 0 || fades.current.size > 0
      const pingsMove =
        pulses.current.size > 0 ||
        shown.some((ping) => pingAnimates(ping, now, motion)) ||
        (tokensMove && shown.length > 0)
      if (tokensMove || animating.current.tokens) tokenLayerRef.current?.batchDraw()
      if (pingsMove || animating.current.pings) pingLayerRef.current?.batchDraw()
      if (tokensMove && shown.length > 0) positionMarkers()
      animating.current = { tokens: tokensMove, pings: pingsMove }
      // Arrows wait for their fade without drawing.
      const waiting =
        motion && shown.some((ping) => ping.kind === 'arrow' && !pingExpired(ping, now))
      if (tokensMove || pingsMove || waiting) frame.current = requestAnimationFrame(tick)
    },
    [positionMarkers],
  )

  const kick = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    },
    [],
  )

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

  // The discoverability hint, once per device (knowledge/features/pings-and-arrows.md).
  const [hintOpen, setHintOpen] = useState(() => !hintSeen())
  const dismissHint = useCallback(() => {
    setHintOpen(false)
    rememberHintSeen()
  }, [])
  const doubleTaps = !!(onDoubleTap || onArrow)

  // Gestures read the latest props through a ref, so the listeners stay attached.
  const latest = useRef({
    board,
    scene,
    onCellTap,
    onTokenTap,
    selectedTokenId,
    onTapTakenBack,
    onDoubleTap,
    onArrow,
  })
  useLayoutEffect(() => {
    latest.current = {
      board,
      scene,
      onCellTap,
      onTokenTap,
      selectedTokenId,
      onTapTakenBack,
      onDoubleTap,
      onArrow,
    }
  })

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const tracker = new GestureTracker({ doubleTap: doubleTaps })
    /** Where the arrow being drawn starts; null when it started off the map. */
    let arrowStart: PingTarget | null | undefined

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

    /** The cell under a point and the token drawn on top there; null off the map. */
    const pingTarget = (point: Point): PingTarget | null => {
      const v = view.current
      if (!v) return null
      const { board, scene, selectedTokenId } = latest.current
      const cell = screenToCell(v, point)
      const token = tokenAt(board.tokens, cell, selectedTokenId)
      if (token) return { cell, tokenId: token.id }
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < scene.width && cell.y < scene.height
      return inside ? { cell } : null
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

    const arrow = (gesture: Extract<Gesture, { type: 'arrow' }>) => {
      const v = view.current
      if (arrowStart === undefined) arrowStart = pingTarget(gesture.from)
      const from = arrowStart
      if (gesture.done) arrowStart = undefined
      if (!from || !v) return
      const { scene, onArrow } = latest.current
      const cell = screenToCell(v, gesture.to)
      const to = {
        x: clamp(cell.x, 0, scene.width - 1),
        y: clamp(cell.y, 0, scene.height - 1),
      }
      onArrow?.(from, to, gesture.done)
      if (gesture.done && (to.x !== from.cell.x || to.y !== from.cell.y)) dismissHint()
    }

    const run = (gesture: Gesture | null) => {
      if (!gesture) return
      switch (gesture.type) {
        case 'tap':
          return tap(gesture.point)
        case 'pan':
          return transform((v) => ({ ...v, x: v.x + gesture.dx, y: v.y + gesture.dy }))
        case 'pinch':
          return transform((v, world, s) => {
            const zoomed = zoomAt(v, gesture.center, gesture.factor, zoomLimits(world, s))
            return { ...zoomed, x: zoomed.x + gesture.dx, y: zoomed.y + gesture.dy }
          })
        case 'takeBack':
          arrowStart = undefined
          setInfo(null)
          return latest.current.onTapTakenBack?.()
        case 'doubleTap': {
          const target = pingTarget(gesture.point)
          if (!target || !latest.current.onDoubleTap) return
          latest.current.onDoubleTap(target)
          return dismissHint()
        }
        case 'arrow':
          return arrow(gesture)
      }
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
      run(tracker.down(sample(e)))
    }
    const onPointerMove = (e: PointerEvent) => run(tracker.move(sample(e)))
    const onPointerUp = (e: PointerEvent) => run(tracker.up(sample(e)))
    const onPointerCancel = (e: PointerEvent) => run(tracker.cancel(e.pointerId))
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
      // No browser zoom or word selection on a double click.
      ['dblclick', prevent],
      ['contextmenu', prevent],
    ]
    for (const [type, listener, options] of listeners)
      surface.addEventListener(type, listener as EventListener, options)
    return () => {
      for (const [type, listener, options] of listeners)
        surface.removeEventListener(type, listener as EventListener, options)
    }
  }, [applyView, doubleTaps, dismissHint])

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

  const stacks = useMemo(() => stackCounts(tokens, selectedTokenId), [tokens, selectedTokenId])
  const marks = useMemo(() => tokenMarks(tokens), [tokens])
  // Each token image loads once; its arrival re-renders, which redraws the tokens.
  const images = useTokenPictures(useMemo(() => tokens.map((token) => token.imageUrl), [tokens]))
  const ghostToken = useMemo(() => {
    const token = ghost && tokens.find((t) => t.id === ghost.tokenId)
    return token ? { ...token, x: ghost.x, y: ghost.y } : null
  }, [ghost, tokens])

  // Status badges: the definitions by id, and each icon loaded once like token images.
  const definitions = board.statuses
  const statusById = useMemo(
    () => new Map<string, StatusDefinition>((definitions ?? []).map((s) => [s.id, s])),
    [definitions],
  )
  const iconUrls = useMemo(() => {
    const used = new Set(tokens.flatMap((token) => (token.statuses ?? []).map((s) => s.statusId)))
    return (definitions ?? []).filter((s) => used.has(s.id)).map((s) => s.iconUrl)
  }, [tokens, definitions])
  const icons = useTokenPictures(iconUrls)
  const statusLook = useMemo(() => ({ definitions: statusById, icons }), [statusById, icons])

  // Slides and fades start when the tokens change; a new fight starts without either.
  const encounterId = board.encounterId
  useLayoutEffect(() => {
    const now = performance.now()
    const motion = slide && !prefersReducedMotion()
    const same = lastBoard.current === encounterId
    const before = lastTokens.current
    const current = new Map<string, BoardToken>()
    for (const token of tokens) {
      current.set(token.id, token)
      const was = before.get(token.id)
      if (!same || !motion) {
        slides.current.delete(token.id)
        continue
      }
      if (!was) {
        // Back on the board (restored, or first seen after the first render): fades in.
        fades.current.set(token.id, { token, start: now, out: false })
        continue
      }
      if (was.x === token.x && was.y === token.y) continue
      if (instantTokenIds?.has(token.id)) {
        slides.current.delete(token.id)
        continue
      }
      // From where it is drawn now, so a slide cut short by another move doesn't jump.
      const from = slidingAt(slides.current.get(token.id), was, now)
      slides.current.set(token.id, { fromX: from.x, fromY: from.y, start: now })
    }
    if (same && motion) {
      for (const [id, token] of before)
        if (!current.has(id)) fades.current.set(id, { token, start: now, out: true })
    } else fades.current.clear()
    lastTokens.current = current
    lastBoard.current = encounterId
    if (slides.current.size > 0 || fades.current.size > 0) kick()
  }, [tokens, slide, instantTokenIds, encounterId, kick])

  // Pings: redraw their layer and markers when they or the tokens change.
  useLayoutEffect(() => {
    pingLayerRef.current?.batchDraw()
    positionMarkers()
    if ((pings?.length ?? 0) > 0) kick()
  }, [pings, tokens, positionMarkers, kick])

  // Markers follow every render: new ones, and the inset they keep clear of.
  useLayoutEffect(() => {
    positionMarkers()
  })
  const [insetTop, insetRight, insetBottom] = [
    inset?.top ?? 0,
    inset?.right ?? 0,
    inset?.bottom ?? 0,
  ]

  // keepInView: pan just enough to bring the token out from under the page's overlays.
  const kept = keepInView ? tokens.find((token) => token.id === keepInView) : undefined
  const [keptX, keptY, keptSize] = [kept?.x, kept?.y, kept ? footprint(kept.size) : 0]
  useLayoutEffect(() => {
    const v = view.current
    const s = screen.current
    if (keptX === undefined || keptY === undefined || !v || !s) return
    const area = uncoveredArea(s, { top: insetTop, right: insetRight, bottom: insetBottom })
    const next = keptInView(v, { x: keptX * CELL, y: keptY * CELL, size: keptSize }, area, s)
    if (next) moveView(next)
  }, [keptX, keptY, keptSize, insetTop, insetRight, insetBottom, size, moveView])

  useImperativeHandle(
    handleRef,
    () => ({
      fit,
      centerOn(tokenId, options) {
        const token = tokensRef.current.find((candidate) => candidate.id === tokenId)
        const v = view.current
        const s = screen.current
        if (!token || !v || !s) return
        const world = worldSize(width, height)
        const next = centredOn(
          v,
          { x: token.x * CELL, y: token.y * CELL, size: footprint(token.size) },
          uncoveredArea(s, insetRef.current),
          fitViewport(world, s).scale,
          zoomLimits(world, s).max,
        )
        moveView(next)
        if (options?.pulse) {
          pulses.current.set(token.id, { start: performance.now(), color: ringColor(token) })
          kick()
        }
      },
    }),
    [width, height, moveView, kick, fit],
  )

  /** Tapping a marker pans its ping to the middle of the uncovered board. */
  const goToPing = (id: string) => {
    const ping = pingsRef.current.find((candidate) => candidate.id === id)
    const v = view.current
    const s = screen.current
    const points = ping && pingPoints(ping, placedToken)
    if (!points || !v || !s) return
    moveView(panTo(v, points.target, uncoveredArea(s, insetRef.current)))
  }

  // A new function per render redraws the tokens; renders only follow prop or info changes.
  // Animation frames redraw the token layer with it, reading slides and fades from the refs.
  const drawTokenShape = (con: Konva.Context) => {
    const ctx = con._context
    const cssScale = ctx.getTransform().a / con.canvas.getPixelRatio()
    const now = performance.now()
    const moving = slides.current.size > 0
    let drawn: BoardToken[] | readonly BoardToken[] = moving
      ? tokens.map((token) => {
          const at = slidingAt(slides.current.get(token.id), token, now)
          return at === token ? token : { ...token, x: at.x, y: at.y }
        })
      : tokens
    let alpha: Map<string, number> | undefined
    if (fades.current.size > 0) {
      alpha = new Map()
      const leaving: BoardToken[] = []
      for (const [id, fade] of fades.current) {
        const t = Math.min(1, Math.max(0, (now - fade.start) / FADE_MS))
        alpha.set(id, fade.out ? 1 - t : t)
        if (fade.out) leaving.push(fade.token)
      }
      // Leaving tokens lie under the others.
      if (leaving.length > 0) drawn = [...leaving, ...drawn]
    }
    drawTokens(ctx, drawn, {
      selectedTokenId,
      cssScale,
      marker,
      ghost: ghostToken,
      arrows,
      stacks,
      marks,
      images,
      statuses: statusLook,
      alpha,
    })
  }

  const drawPingShape = useCallback(
    (con: Konva.Context) => {
      const ctx = con._context
      const cssScale = ctx.getTransform().a / con.canvas.getPixelRatio()
      const now = performance.now()
      const motion = !prefersReducedMotion()
      drawPings(ctx, pingsRef.current, placedToken, { cssScale, now, motion })
      for (const [id, pulse] of pulses.current) {
        const token = placedToken(id)
        if (token) drawPulse(ctx, token, pulse.color, now - pulse.start, { cssScale, motion })
      }
    },
    [placedToken],
  )

  const announced = (pings ?? []).filter((ping) => ping.kind !== 'arrow' || ping.done)

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
              <Layer ref={pingLayerRef} listening={false}>
                <Shape sceneFunc={drawPingShape} listening={false} />
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

        {pings?.map((ping) => (
          <button
            key={ping.id}
            ref={(element) => {
              if (!element) return
              markerEls.current.set(ping.id, element)
              return () => {
                markerEls.current.delete(ping.id)
              }
            }}
            type="button"
            aria-label={de.pings.marker(ping.name)}
            data-ping-marker={ping.id}
            onClick={() => goToPing(ping.id)}
            className="absolute top-0 left-0 z-10 items-center justify-center rounded-full"
            // Hidden until placed; positionMarkers shows it (React leaves an unchanged style be).
            style={MARKER_STYLE}
          >
            <span className="flex h-full w-full items-center justify-center">
              <MarkerIcon color={ping.color} />
            </span>
          </button>
        ))}

        {doubleTaps && hintOpen && (
          <div
            className="absolute z-10 flex justify-center"
            style={{ left: EDGE, right: HINT_RIGHT, bottom: insetBottom + HINT_BOTTOM }}
          >
            <p
              role="note"
              className="flex items-center gap-2 rounded-lg border border-candle/40 bg-panel/95 py-1 pr-1 pl-3 text-sm text-parchment shadow-lg shadow-black/40"
            >
              <span>{de.pings.hint}</span>
              <button
                type="button"
                onClick={dismissHint}
                aria-label={de.pings.closeHint}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-dim hover:text-parchment"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </p>
          </div>
        )}

        <div className="sr-only" aria-live="polite" data-testid="board-pings">
          {announced.map((ping) => (
            <p
              key={ping.id}
              data-ping={ping.kind}
              data-user={ping.userId}
              data-cell={
                ping.kind === 'cell'
                  ? `${ping.cell.x},${ping.cell.y}`
                  : ping.kind === 'arrow'
                    ? `${ping.to.x},${ping.to.y}`
                    : undefined
              }
              data-token={ping.kind === 'token' ? ping.tokenId : undefined}
            >
              {announce(ping, tokens)}
            </p>
          ))}
        </div>

        <button
          type="button"
          onClick={fit}
          className="absolute z-10 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel/90 px-3 text-sm text-parchment shadow-lg shadow-black/40 hover:border-candle"
          style={{ right: EDGE + insetRight, bottom: EDGE + insetBottom }}
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

/** How long a token takes to fade out when it leaves the board, or in when it comes back. */
export const FADE_MS = 500

/** The size of an off-screen marker's tap area, in CSS pixels. */
const MARKER_SIZE = 40
const MARKER_STYLE = { width: MARKER_SIZE, height: MARKER_SIZE, display: 'none' } as const

/** A token gliding from (fromX, fromY), in cells, since `start` (performance.now()). */
interface Slide {
  fromX: number
  fromY: number
  start: number
}

/** A token fading out (`token` as last seen) or in, since `start`. */
interface Fade {
  token: BoardToken
  start: number
  out: boolean
}

/** "Meine Figur": a token pulsing once in its ring colour since `start`. */
interface Pulse {
  start: number
  color: string
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

/** What a screen reader says about a ping. */
function announce(ping: ShownPing, tokens: readonly BoardToken[]): string {
  if (ping.kind === 'cell') return de.pings.announceCell(ping.name)
  if (ping.kind === 'arrow') return de.pings.announceArrow(ping.name)
  const label = tokens.find((token) => token.id === ping.tokenId)?.label
  return label ? de.pings.announceToken(ping.name, label) : de.pings.announceCell(ping.name)
}

const HINT_KEY = 'oreana.pingHintSeen'

/** Whether this device has seen (closed or used) the double-tap hint. */
function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

function rememberHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    // Without storage the hint shows again next time; closing it still hides it now.
  }
}

/** A disc in the ping's colour with a point on its right; rotated towards the ping. */
function MarkerIcon({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 drop-shadow">
      <path d="M30 16 21 9.5v13z" fill={color} stroke="#0a0b0e" strokeWidth="1.5" />
      <circle cx="14" cy="16" r="9" fill={color} stroke="#0a0b0e" strokeWidth="2" />
      <circle cx="14" cy="16" r="3" fill="#0a0b0e" />
    </svg>
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
