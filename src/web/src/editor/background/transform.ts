// Moving, scaling and turning the picked background on the editor's canvas
// (knowledge/features/dm-map-editor.md, "Background"): the handles around the picture and
// two-point calibration. Pure functions on a BackgroundPlacement, in cells; the picture
// turns around its centre, clockwise in degrees, as the board draws it (board/background.ts).
import type { BackgroundPlacement } from '../../api/types'

export interface Vec {
  x: number
  y: number
}

/** The server's limits (BackgroundPlacement.cs): the smallest and largest edge in cells. */
export const MIN_EDGE = 0.25
export const MAX_EDGE = 400
export const MAX_OFFSET = 400

/** Screen distances of the handles, in CSS pixels. */
export const HANDLE_RADIUS = 9
export const ROTATE_HANDLE_GAP = 28

/** Turns snap to these steps with Shift, and to right angles when this close without. */
export const ROTATE_STEP = 15
const RIGHT_ANGLE_SNAP = 2

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

function rotate(v: Vec, degrees: number): Vec {
  const c = Math.cos(rad(degrees))
  const s = Math.sin(rad(degrees))
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

export function centreOf(p: BackgroundPlacement): Vec {
  return { x: p.x + p.width / 2, y: p.y + p.height / 2 }
}

/** A spot on the map in the picture's own frame: from its centre, unturned. */
export function toLocal(p: BackgroundPlacement, point: Vec): Vec {
  const c = centreOf(p)
  return rotate({ x: point.x - c.x, y: point.y - c.y }, -p.rotation)
}

/** A spot in the picture's own frame on the map. */
export function toMap(p: BackgroundPlacement, local: Vec): Vec {
  const c = centreOf(p)
  const v = rotate(local, p.rotation)
  return { x: c.x + v.x, y: c.y + v.y }
}

/** The four corners on the map, clockwise from the top left. */
export function cornersOf(p: BackgroundPlacement): Vec[] {
  const w = p.width / 2
  const h = p.height / 2
  return [
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ].map((local) => toMap(p, local))
}

/** Where the turn handle sits on the map: above the top edge's middle, a fixed screen gap away. */
export function rotateHandleOf(p: BackgroundPlacement, cellPx: number): Vec {
  return toMap(p, { x: 0, y: -p.height / 2 - ROTATE_HANDLE_GAP / cellPx })
}

/** What a press at a spot grabs: a corner (0–3, clockwise from top left), the turn handle, the picture, or nothing. */
export type Grab = { kind: 'corner'; index: number } | { kind: 'rotate' } | { kind: 'move' } | null

export function grabAt(p: BackgroundPlacement, point: Vec, cellPx: number): Grab {
  const reach = (HANDLE_RADIUS + 3) / cellPx
  const near = (a: Vec) => Math.hypot(a.x - point.x, a.y - point.y) <= reach
  if (near(rotateHandleOf(p, cellPx))) return { kind: 'rotate' }
  const index = cornersOf(p).findIndex(near)
  if (index >= 0) return { kind: 'corner', index }
  const local = toLocal(p, point)
  if (Math.abs(local.x) <= p.width / 2 && Math.abs(local.y) <= p.height / 2) return { kind: 'move' }
  return null
}

/** Keeps the placement within the server's limits. */
export function clampPlacement(p: BackgroundPlacement): BackgroundPlacement {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return {
    ...p,
    x: clamp(p.x, -MAX_OFFSET, MAX_OFFSET),
    y: clamp(p.y, -MAX_OFFSET, MAX_OFFSET),
    rotation: normaliseAngle(p.rotation),
  }
}

/** An angle in (−180, 180]. */
export function normaliseAngle(degrees: number): number {
  let a = degrees % 360
  if (a <= -180) a += 360
  if (a > 180) a -= 360
  return a
}

/** Moved by the pointer's way from `from` to `to`. */
export function moved(base: BackgroundPlacement, from: Vec, to: Vec): BackgroundPlacement {
  return clampPlacement({ ...base, x: base.x + to.x - from.x, y: base.y + to.y - from.y })
}

/**
 * Turned around the centre by the angle the pointer swept from `from` to `to`. With
 * `steps`, in steps of ROTATE_STEP; without, right angles catch it when close.
 */
export function rotated(
  base: BackgroundPlacement,
  from: Vec,
  to: Vec,
  steps: boolean,
): BackgroundPlacement {
  const c = centreOf(base)
  const swept = deg(Math.atan2(to.y - c.y, to.x - c.x) - Math.atan2(from.y - c.y, from.x - c.x))
  let angle = base.rotation + swept
  if (steps) angle = Math.round(angle / ROTATE_STEP) * ROTATE_STEP
  else {
    const right = Math.round(angle / 90) * 90
    if (Math.abs(angle - right) <= RIGHT_ANGLE_SNAP) angle = right
  }
  return clampPlacement({ ...base, rotation: angle })
}

/**
 * Scaled by dragging corner `index` to `to`, keeping the picture's aspect and the opposite
 * corner where it is.
 */
export function scaled(base: BackgroundPlacement, index: number, to: Vec): BackgroundPlacement {
  const corners = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ]
  const sign = corners[index]!
  const w = base.width / 2
  const h = base.height / 2
  const anchor = { x: -sign.x * w, y: -sign.y * h }
  const diagonal = { x: sign.x * base.width, y: sign.y * base.height }
  const local = toLocal(base, to)
  const along = { x: local.x - anchor.x, y: local.y - anchor.y }
  const length2 = diagonal.x * diagonal.x + diagonal.y * diagonal.y
  const smallest = Math.max(MIN_EDGE / base.width, MIN_EDGE / base.height)
  const largest = Math.min(MAX_EDGE / base.width, MAX_EDGE / base.height)
  const factor = Math.min(
    largest,
    Math.max(smallest, (along.x * diagonal.x + along.y * diagonal.y) / length2),
  )
  const width = base.width * factor
  const height = base.height * factor
  // The anchor stays on the map; the new centre lies half the scaled diagonal from it.
  const anchorOnMap = toMap(base, anchor)
  const half = rotate({ x: (diagonal.x * factor) / 2, y: (diagonal.y * factor) / 2 }, base.rotation)
  const centre = { x: anchorOnMap.x + half.x, y: anchorOnMap.y + half.y }
  return clampPlacement({
    ...base,
    x: centre.x - width / 2,
    y: centre.y - height / 2,
    width,
    height,
  })
}

/**
 * Two-point calibration: the picture moves, scales and turns so that the picture's spots
 * `from[0]` and `from[1]` land on the map's spots `to[0]` and `to[1]`. Null when the two
 * picture spots (or map spots) are too close together to tell a scale.
 */
export function calibrated(
  base: BackgroundPlacement,
  from: readonly [Vec, Vec],
  to: readonly [Vec, Vec],
): BackgroundPlacement | null {
  const [a1, a2] = from
  const [b1, b2] = to
  const va = { x: a2.x - a1.x, y: a2.y - a1.y }
  const vb = { x: b2.x - b1.x, y: b2.y - b1.y }
  const la = Math.hypot(va.x, va.y)
  const lb = Math.hypot(vb.x, vb.y)
  if (la < 0.05 || lb < 0.5) return null
  const factor = lb / la
  const turn = deg(Math.atan2(vb.y, vb.x) - Math.atan2(va.y, va.x))
  const width = base.width * factor
  const height = base.height * factor
  if (width < MIN_EDGE || height < MIN_EDGE || width > MAX_EDGE || height > MAX_EDGE) return null
  // The centre goes where the same mapping takes it: b1 + factor · turn(c − a1).
  const c = centreOf(base)
  const v = rotate({ x: (c.x - a1.x) * factor, y: (c.y - a1.y) * factor }, turn)
  const centre = { x: b1.x + v.x, y: b1.y + v.y }
  return clampPlacement({
    ...base,
    x: centre.x - width / 2,
    y: centre.y - height / 2,
    width,
    height,
    rotation: base.rotation + turn,
  })
}

/** The nearest grid corner, where calibration's map spots go. */
export function nearestCorner(point: Vec): Vec {
  return { x: Math.round(point.x), y: Math.round(point.y) }
}

/** The placement after rows and columns were added (positive) or removed at the left and top. */
export function shifted(p: BackgroundPlacement, left: number, top: number): BackgroundPlacement {
  if (left === 0 && top === 0) return p
  return clampPlacement({ ...p, x: p.x + left, y: p.y + top })
}
