// The "Hintergrund" tool on the canvas (knowledge/features/dm-map-editor.md, "Background"):
// while it is active the picked picture gets a frame with handles. Dragging the picture
// moves it, a corner scales it around the opposite corner, the handle above turns it
// (Shift: 15° steps). Every drag is one undo step on the map's backgroundPlacement.
// Calibration takes four clicks instead: a grid point in the picture, the map's grid corner
// it belongs on, then a second pair; the picture then moves, scales and turns to fit.
import { createStore, useStore } from 'zustand'
import type { BackgroundPlacement } from '../../api/types'
import { CELL } from '../../board/viewport'
import type { EditorState, EditorStore } from '../store'
import type { CellPointer, ToolContext } from '../tools'
import { placementFor } from './backgrounds'
import {
  calibrated,
  cornersOf,
  grabAt,
  HANDLE_RADIUS,
  moved,
  nearestCorner,
  rotated,
  rotateHandleOf,
  scaled,
  toMap,
  type Grab,
  type Vec,
} from './transform'

// ---- Calibration ------------------------------------------------------------------------

export interface CalibrationState {
  active: boolean
  /** Clicked so far, in order: picture spot, map corner, picture spot, map corner. */
  points: Vec[]
  /** The last calibration ended with spots too close together to tell a scale. */
  failed: boolean
}

export const calibration = createStore<CalibrationState>()(() => ({
  active: false,
  points: [],
  failed: false,
}))

export function useCalibration<T>(selector: (state: CalibrationState) => T): T {
  return useStore(calibration, selector)
}

export function startCalibration(store: EditorStore) {
  calibration.setState({ active: true, points: [], failed: false })
  redraw(store)
}

export function stopCalibration(store?: EditorStore) {
  calibration.setState({ active: false, points: [], failed: false })
  if (store) redraw(store)
}

// ---- The placement being edited -----------------------------------------------------------

/** The picked picture's placement now, or null without a shown, visible picture. */
export function currentPlacement(state: EditorState): BackgroundPlacement | null {
  if (!state.background || !state.backgroundVisible) return null
  return placementFor(state.background, state.doc.backgroundPlacement)
}

function setPlacement(store: EditorStore, placement: BackgroundPlacement) {
  store.getState().apply((doc) => ({ ...doc, backgroundPlacement: placement }))
}

let drag: { grab: Exclude<Grab, null>; base: BackgroundPlacement; from: Vec } | null = null

/** A new overlay array makes the canvas draw the frame again. */
function redraw(store: EditorStore) {
  const state = store.getState()
  if (state.overlay.some((shape) => shape.kind === 'custom')) state.setOverlay([...state.overlay])
}

const CURSORS = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']

/** The cursor a corner shows, turned with the picture so it points along the drag. */
function cornerCursor(index: number, rotation: number): string {
  const quarter = Math.round(rotation / 90)
  return CURSORS[(((index + quarter) % 4) + 4) % 4]!
}

export function cursorAt(pointer: CellPointer, ctx: ToolContext): string | null {
  const state = ctx.store.getState()
  const placement = currentPlacement(state)
  if (!placement) return 'default'
  if (calibration.getState().active) return 'crosshair'
  if (drag)
    return drag.grab.kind === 'move' ? 'move' : drag.grab.kind === 'rotate' ? 'grabbing' : null
  const grab = grabAt(placement, pointer.point, pointer.cellPx)
  if (!grab) return 'default'
  if (grab.kind === 'move') return 'move'
  if (grab.kind === 'rotate') return 'grab'
  return cornerCursor(grab.index, placement.rotation)
}

export function onPointerDown(pointer: CellPointer, ctx: ToolContext) {
  const { store } = ctx
  const placement = currentPlacement(store.getState())
  if (!placement) return
  const cal = calibration.getState()
  if (cal.active) {
    // Picture spots are taken as clicked; map spots snap to the nearest grid corner.
    const point = cal.points.length % 2 === 0 ? pointer.point : nearestCorner(pointer.point)
    const points = [...cal.points, point]
    if (points.length < 4) {
      calibration.setState({ points })
      redraw(store)
      return
    }
    const [a1, b1, a2, b2] = points as [Vec, Vec, Vec, Vec]
    const result = calibrated(placement, [a1, a2], [b1, b2])
    calibration.setState({ active: false, points: [], failed: !result })
    if (result) setPlacement(store, result)
    else redraw(store)
    return
  }
  const grab = grabAt(placement, pointer.point, pointer.cellPx)
  if (!grab) return
  drag = { grab, base: placement, from: pointer.point }
  store.getState().beginGesture()
}

export function onPointerMove(pointer: CellPointer, ctx: ToolContext) {
  if (!drag || !pointer.pressed) return
  const { grab, base, from } = drag
  const next =
    grab.kind === 'move'
      ? moved(base, from, pointer.point)
      : grab.kind === 'rotate'
        ? rotated(base, from, pointer.point, pointer.shift)
        : scaled(base, grab.index, pointer.point)
  ctx.store.getState().updateGesture((current) => ({ ...current, backgroundPlacement: next }))
}

export function onPointerUp(_pointer: CellPointer, ctx: ToolContext) {
  if (!drag) return
  drag = null
  ctx.store.getState().endGesture()
}

export function onPointerLeave() {
  drag = null
}

export function onActivate(ctx: ToolContext) {
  const { store } = ctx
  drag = null
  stopCalibration()
  store.getState().setOverlay([{ kind: 'custom', draw: (c, scale) => drawFrame(c, scale, store) }])
}

export function onDeactivate() {
  drag = null
  stopCalibration()
}

// ---- Drawing ------------------------------------------------------------------------------

const FRAME = 'rgba(240, 196, 110, 0.95)'
const SHADOW = 'rgba(14, 15, 19, 0.85)'
const PICTURE_SPOT = '#f0c46e'
const MAP_SPOT = '#7dd3fc'

/** The frame, its handles and calibration's spots, in world units (CELL per cell). */
function drawFrame(ctx: CanvasRenderingContext2D, cssScale: number, store: EditorStore) {
  const placement = currentPlacement(store.getState())
  if (!placement) return
  const px = 1 / cssScale
  const cellPx = cssScale * CELL
  const world = (v: Vec) => ({ x: v.x * CELL, y: v.y * CELL })
  const cal = calibration.getState()
  ctx.save()
  ctx.lineJoin = 'round'

  const corners = cornersOf(placement).map(world)
  const outline = (color: string, width: number, dash: number[]) => {
    ctx.beginPath()
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)))
    ctx.closePath()
    ctx.setLineDash(dash.map((d) => d * px))
    ctx.strokeStyle = color
    ctx.lineWidth = width * px
    ctx.stroke()
  }
  outline(SHADOW, 3, [])
  outline(FRAME, 1.5, cal.active ? [6, 4] : [])
  ctx.setLineDash([])

  if (!cal.active) {
    const top = world(toMap(placement, { x: 0, y: -placement.height / 2 }))
    const knob = world(rotateHandleOf(placement, cellPx))
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(knob.x, knob.y)
    ctx.strokeStyle = FRAME
    ctx.lineWidth = 1.5 * px
    ctx.stroke()
    const r = HANDLE_RADIUS * px
    ctx.fillStyle = '#14161b'
    ctx.strokeStyle = FRAME
    ctx.lineWidth = 2 * px
    ctx.beginPath()
    ctx.arc(knob.x, knob.y, r * 0.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    for (const c of corners) {
      ctx.fillRect(c.x - r * 0.7, c.y - r * 0.7, r * 1.4, r * 1.4)
      ctx.strokeRect(c.x - r * 0.7, c.y - r * 0.7, r * 1.4, r * 1.4)
    }
  }

  // Calibration: each picture spot with a line to the map corner it goes to.
  cal.points.forEach((point, i) => {
    const at = world(point)
    if (i % 2 === 1) {
      const from = world(cal.points[i - 1]!)
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(at.x, at.y)
      ctx.setLineDash([4 * px, 3 * px])
      ctx.strokeStyle = MAP_SPOT
      ctx.lineWidth = 1.5 * px
      ctx.stroke()
      ctx.setLineDash([])
    }
    drawSpot(ctx, at, i % 2 === 0 ? PICTURE_SPOT : MAP_SPOT, px, String(Math.floor(i / 2) + 1))
  })
  ctx.restore()
}

function drawSpot(
  ctx: CanvasRenderingContext2D,
  at: Vec,
  color: string,
  px: number,
  label: string,
) {
  const r = 7 * px
  ctx.beginPath()
  ctx.moveTo(at.x - r * 1.6, at.y)
  ctx.lineTo(at.x + r * 1.6, at.y)
  ctx.moveTo(at.x, at.y - r * 1.6)
  ctx.lineTo(at.x, at.y + r * 1.6)
  ctx.strokeStyle = SHADOW
  ctx.lineWidth = 3 * px
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 * px
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.font = `700 ${11 * px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = 3 * px
  ctx.strokeStyle = SHADOW
  ctx.strokeText(label, at.x + r, at.y - r)
  ctx.fillStyle = color
  ctx.fillText(label, at.x + r, at.y - r)
}
