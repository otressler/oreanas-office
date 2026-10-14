// The map editor's canvas: the map drawn as the board draws it (board/render.ts), a
// grid over every cell including void so empty cells can be painted, the selection,
// and the shapes tools put in the store's overlay. Mouse first (laptops): the primary
// button goes to the active tool; the middle or right button, or Space with the
// primary button, pans; the wheel zooms at the pointer.
import type Konva from 'konva'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Layer, Shape, Stage } from 'react-konva'
import { useStore } from 'zustand'
import { buildScene, type MapScene } from '../board/scene'
import { drawLabels, drawMap, visibleCells } from '../board/render'
import { wheelZoomFactor } from '../board/gestures'
import { useElementSize } from '../board/useElementSize'
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
} from '../board/viewport'
import type { GridPoint } from '../board/geometry'
import { de } from '../text/de'
import type { EditorMap } from './model'
import { useEditorStore, type Overlay, type OverlayStyle, type Selection } from './store'
import type { CellPointer, EditorTool } from './tools'

const OVERLAY_COLORS: Record<OverlayStyle, { fill: string; stroke: string }> = {
  paint: { fill: 'rgba(224, 173, 79, 0.28)', stroke: 'rgba(240, 196, 110, 0.95)' },
  erase: { fill: 'rgba(20, 22, 27, 0.55)', stroke: 'rgba(236, 230, 216, 0.7)' },
  select: { fill: 'rgba(224, 173, 79, 0.12)', stroke: 'rgba(240, 196, 110, 1)' },
  invalid: { fill: 'rgba(229, 72, 77, 0.3)', stroke: 'rgba(229, 72, 77, 0.95)' },
}

export interface EditorCanvasProps {
  tool: EditorTool | undefined
  /** Called with the cell under the pointer (null when it leaves), for the status bar. */
  onHover?: (cell: GridPoint | null) => void
  className?: string
}

export function EditorCanvas({ tool, onHover, className }: EditorCanvasProps) {
  const store = useEditorStore()
  const doc = useStore(store, (s) => s.doc)
  const overlay = useStore(store, (s) => s.overlay)
  const selection = useStore(store, (s) => s.selection)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const size = useElementSize(surfaceRef)
  const scene = useMemo(() => buildScene(doc), [doc])

  const view = useRef<Viewport | null>(null)
  const screen = useRef<Size | null>(null)
  const fitted = useRef(true)
  const lastSize = useRef('')

  const applyView = useCallback((next: Viewport) => {
    view.current = next
    const stage = stageRef.current
    if (stage) {
      stage.scale({ x: next.scale, y: next.scale })
      stage.position({ x: next.x, y: next.y })
      stage.batchDraw()
    }
  }, [])

  const fit = useCallback(() => {
    const s = screen.current
    if (!s) return
    fitted.current = true
    applyView(fitViewport(worldSize(doc.width, doc.height), s))
  }, [applyView, doc.width, doc.height])

  // First fit, a resized map, and a resized window: refit while fitted, else keep the centre.
  useLayoutEffect(() => {
    if (!size) return
    const world = worldSize(doc.width, doc.height)
    const key = `${doc.width}x${doc.height}`
    const before = screen.current
    screen.current = size
    const keep = view.current && before && !fitted.current && key === lastSize.current
    lastSize.current = key
    if (keep) applyView(keepCentre(view.current!, before!, size, world))
    else {
      fitted.current = true
      applyView(fitViewport(world, size))
    }
  }, [size, doc.width, doc.height, applyView])

  // Pointer handling reads the latest tool and map through a ref.
  const latest = useRef({ tool, doc, onHover })
  useLayoutEffect(() => {
    latest.current = { tool, doc, onHover }
  })

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const ctx = { store }
    let space = false
    let pan: { x: number; y: number } | null = null
    let toolPointer: number | null = null
    let lastCell: GridPoint | null = null

    const local = (e: { clientX: number; clientY: number }): Point => {
      const rect = surface.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const pointer = (e: PointerEvent, pressed: boolean): CellPointer | null => {
      const v = view.current
      if (!v) return null
      const cell = screenToCell(v, local(e))
      const { doc } = latest.current
      return {
        cell,
        inside: cell.x >= 0 && cell.y >= 0 && cell.x < doc.width && cell.y < doc.height,
        pressed,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: e.ctrlKey || e.metaKey,
      }
    }
    const transform = (change: (v: Viewport, world: Size, s: Size) => Viewport) => {
      const v = view.current
      const s = screen.current
      if (!v || !s) return
      const { doc } = latest.current
      const world = worldSize(doc.width, doc.height)
      fitted.current = false
      applyView(clampPan(change(v, world, s), world, s))
    }

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      surface.focus({ preventScroll: true })
      const panning = e.button === 1 || e.button === 2 || (e.button === 0 && space)
      if (panning) {
        pan = local(e)
        surface.setPointerCapture(e.pointerId)
        surface.style.cursor = 'grabbing'
        return
      }
      if (e.button !== 0 || toolPointer !== null) return
      const p = pointer(e, true)
      if (!p) return
      toolPointer = e.pointerId
      surface.setPointerCapture(e.pointerId)
      lastCell = p.cell
      latest.current.tool?.onPointerDown?.(p, ctx)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (pan) {
        const point = local(e)
        const dx = point.x - pan.x
        const dy = point.y - pan.y
        pan = point
        transform((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
        return
      }
      const pressed = toolPointer === e.pointerId
      if (toolPointer !== null && !pressed) return
      const p = pointer(e, pressed)
      if (!p) return
      if (lastCell && lastCell.x === p.cell.x && lastCell.y === p.cell.y) return
      lastCell = p.cell
      latest.current.onHover?.(p.inside ? p.cell : null)
      latest.current.tool?.onPointerMove?.(p, ctx)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (pan) {
        pan = null
        surface.style.cursor = ''
        return
      }
      if (toolPointer !== e.pointerId) return
      toolPointer = null
      const p = pointer(e, false)
      if (p) latest.current.tool?.onPointerUp?.(p, ctx)
    }

    const onPointerCancel = (e: PointerEvent) => {
      if (pan) {
        pan = null
        surface.style.cursor = ''
      }
      if (toolPointer !== e.pointerId) return
      toolPointer = null
      store.getState().cancelGesture()
      latest.current.tool?.onPointerLeave?.(ctx)
    }

    const onPointerLeave = () => {
      if (toolPointer !== null) return
      lastCell = null
      latest.current.onHover?.(null)
      latest.current.tool?.onPointerLeave?.(ctx)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const point = local(e)
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey)
      transform((v, world, s) => zoomAt(v, point, factor, zoomLimits(world, s)))
    }

    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        space = true
        if (!pan) surface.style.cursor = 'grab'
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space = false
        if (!pan) surface.style.cursor = ''
      }
    }
    const prevent = (e: Event) => e.preventDefault()

    const listeners: [EventTarget, string, (e: never) => void, AddEventListenerOptions?][] = [
      [surface, 'pointerdown', onPointerDown],
      [surface, 'pointermove', onPointerMove],
      [surface, 'pointerup', onPointerUp],
      [surface, 'pointercancel', onPointerCancel],
      [surface, 'pointerleave', onPointerLeave],
      [surface, 'wheel', onWheel, { passive: false }],
      [surface, 'contextmenu', prevent],
      [window, 'keydown', onKeyDown],
      [window, 'keyup', onKeyUp],
    ]
    for (const [target, type, listener, options] of listeners)
      target.addEventListener(type, listener as EventListener, options)
    return () => {
      for (const [target, type, listener, options] of listeners)
        target.removeEventListener(type, listener as EventListener, options)
    }
  }, [store, applyView])

  const drawMapShape = useCallback(
    (con: Konva.Context) => {
      const ctx = con._context
      const dpr = con.canvas.getPixelRatio()
      const m = ctx.getTransform()
      drawMap(
        ctx,
        scene,
        visibleCells(m, ctx.canvas.width, ctx.canvas.height, scene.width, scene.height),
      )
      drawEditorGrid(ctx, scene, dpr)
      drawLabels(ctx, scene, dpr)
    },
    [scene],
  )

  const drawOverlayShape = useCallback(
    (con: Konva.Context) => {
      const ctx = con._context
      const cssScale = ctx.getTransform().a / con.canvas.getPixelRatio()
      drawSelection(ctx, doc, selection, cssScale)
      for (const shape of overlay) drawOverlay(ctx, shape, cssScale)
    },
    [doc, selection, overlay],
  )

  return (
    <div className={className} data-testid="editor-canvas">
      <div
        className="relative h-full w-full overflow-hidden bg-table"
        role="region"
        aria-label={de.editor.canvasLabel(doc.name)}
      >
        <div
          ref={surfaceRef}
          tabIndex={-1}
          className="absolute inset-0 touch-none select-none focus:outline-none"
          style={{ cursor: tool?.cursor ?? 'crosshair' }}
          data-editor-surface=""
        >
          {size && size.width > 0 && size.height > 0 && (
            <Stage ref={stageRef} width={size.width} height={size.height} listening={false}>
              <Layer listening={false}>
                <Shape sceneFunc={drawMapShape} listening={false} />
              </Layer>
              <Layer listening={false}>
                <Shape sceneFunc={drawOverlayShape} listening={false} />
              </Layer>
            </Stage>
          )}
        </div>
        <button
          type="button"
          onClick={fit}
          className="absolute right-3 bottom-3 z-10 inline-flex min-h-9 items-center rounded-lg border border-line bg-panel/90 px-3 text-sm text-parchment shadow-lg shadow-black/40 hover:border-candle"
        >
          {de.board.fit}
        </button>
      </div>
    </div>
  )
}

/** A faint line along every cell edge, void included, and a frame around the whole map. */
function drawEditorGrid(ctx: CanvasRenderingContext2D, scene: MapScene, dpr: number) {
  const m = ctx.getTransform()
  const cellPx = m.a * CELL
  const sx = (x: number) => Math.round(m.a * x * CELL + m.e) + 0.5
  const sy = (y: number) => Math.round(m.d * y * CELL + m.f) + 0.5
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (cellPx / dpr >= 6) {
    ctx.beginPath()
    for (let x = 1; x < scene.width; x++) {
      ctx.moveTo(sx(x), sy(0))
      ctx.lineTo(sx(x), sy(scene.height))
    }
    for (let y = 1; y < scene.height; y++) {
      ctx.moveTo(sx(0), sy(y))
      ctx.lineTo(sx(scene.width), sy(y))
    }
    ctx.strokeStyle = 'rgba(236, 230, 216, 0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(236, 230, 216, 0.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(sx(0), sy(0), sx(scene.width) - sx(0), sy(scene.height) - sy(0))
  ctx.restore()
}

function drawOverlay(ctx: CanvasRenderingContext2D, shape: Overlay, cssScale: number) {
  if (shape.kind === 'labels') {
    drawCellLabels(ctx, shape.items, cssScale)
    return
  }
  const colors = OVERLAY_COLORS[shape.style]
  ctx.save()
  ctx.fillStyle = colors.fill
  ctx.strokeStyle = colors.stroke
  ctx.lineWidth = 2 / cssScale
  if (shape.kind === 'rect') {
    ctx.fillRect(shape.x * CELL, shape.y * CELL, shape.w * CELL, shape.h * CELL)
    ctx.strokeRect(shape.x * CELL, shape.y * CELL, shape.w * CELL, shape.h * CELL)
  } else {
    ctx.beginPath()
    for (const cell of shape.cells) ctx.rect(cell.x * CELL, cell.y * CELL, CELL, CELL)
    ctx.fill()
    if (shape.cells.length <= 64) ctx.stroke()
  }
  ctx.restore()
}

/** Texts centred in cells, in a fixed screen size; left out while cells are too small. */
function drawCellLabels(
  ctx: CanvasRenderingContext2D,
  items: readonly { x: number; y: number; text: string }[],
  cssScale: number,
) {
  if (CELL * cssScale < 28) return
  ctx.save()
  ctx.font = `600 ${11 / cssScale}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3 / cssScale
  ctx.strokeStyle = 'rgba(14, 15, 19, 0.85)'
  ctx.fillStyle = '#ece6d8'
  for (const item of items) {
    const cx = (item.x + 0.5) * CELL
    const cy = (item.y + 0.5) * CELL
    ctx.strokeText(item.text, cx, cy)
    ctx.fillText(item.text, cx, cy)
  }
  ctx.restore()
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  doc: EditorMap,
  selection: Selection | null,
  cssScale: number,
) {
  if (!selection) return
  if (selection.kind === 'feature') {
    const f = doc.layout.features.find((item) => item.id === selection.id)
    if (f)
      drawOverlay(ctx, { kind: 'rect', x: f.x, y: f.y, w: f.w, h: f.h, style: 'select' }, cssScale)
    return
  }
  const entrance = doc.layout.entrances.find((item) => item.id === selection.id)
  if (entrance) {
    const cells = entrance.cells.map(([x = 0, y = 0]) => ({ x, y }))
    drawOverlay(ctx, { kind: 'cells', cells, style: 'select' }, cssScale)
  }
}
