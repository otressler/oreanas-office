// Where the board's overlays go (knowledge/features/pings-and-arrows.md, player-extras.md,
// token-card.md): the part of the board the page's own overlays leave uncovered, markers
// at its edge for pings out of view, centring a token ("Meine Figur") and keeping the
// selected token clear of the docked card. Pure functions on CSS pixels and the viewport.
import { CELL, type Point, type Size, type Viewport } from './viewport'

/** A screen rectangle in CSS pixels. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** CSS pixels along the board's edges covered by the page's overlays (BoardProps.inset). */
export interface Inset {
  top?: number
  right?: number
  bottom?: number
}

/** The board minus the strips the page covers. Never empty, however large the inset. */
export function uncoveredArea(screen: Size, inset: Inset | undefined): Rect {
  const top = Math.max(0, inset?.top ?? 0)
  const right = Math.max(0, inset?.right ?? 0)
  const bottom = Math.max(0, inset?.bottom ?? 0)
  return {
    left: 0,
    top: Math.min(top, screen.height - 1),
    right: Math.max(1, screen.width - right),
    bottom: Math.max(top + 1, screen.height - bottom),
  }
}

const inside = (p: Point, r: Rect) =>
  p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom

/** How far from the edge an off-screen marker's middle sits. */
export const MARKER_MARGIN = 22

/** A marker at the edge of the uncovered area pointing towards something out of view. */
export interface EdgeMarker {
  /** The marker's middle, in CSS pixels. */
  x: number
  y: number
  /** Radians, the direction it points in: 0 to the right, π/2 down. */
  angle: number
}

/**
 * The marker for something out of view: on the edge of `area` (inset by `margin`), on the
 * line from the area's middle to the target, pointing at it. Null when any of `visible`
 * (the target by default) lies inside the area: then the thing itself can be seen.
 */
export function edgeMarker(
  target: Point,
  area: Rect,
  margin = MARKER_MARGIN,
  visible: readonly Point[] = [target],
): EdgeMarker | null {
  if (visible.some((point) => inside(point, area))) return null
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  const dx = target.x - cx
  const dy = target.y - cy
  const halfW = Math.max(0, (area.right - area.left) / 2 - margin)
  const halfH = Math.max(0, (area.bottom - area.top) / 2 - margin)
  const t = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  )
  const k = Number.isFinite(t) ? t : 0
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) }
}

/** The view with `world` (a point in world units) in the middle of the area, same zoom. */
export function panTo(view: Viewport, world: Point, area: Rect): Viewport {
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  return { scale: view.scale, x: cx - world.x * view.scale, y: cy - world.y * view.scale }
}

/** About a fingertip: a token drawn smaller than this is hard to find and to tap. */
export const FINGERTIP_PX = 32

/** The cell size "Meine Figur" zooms in to when a token is smaller than a fingertip. */
export const COMFORTABLE_CELL_PX = 48

/**
 * "Meine Figur": the view with the token (its footprint in world units) in the middle of
 * the area. Drawn smaller than a fingertip, it zooms in to the opening zoom (`opening`,
 * the fitted map), or further until a cell is COMFORTABLE_CELL_PX wide, within `maxScale`.
 */
export function centredOn(
  view: Viewport,
  footprint: { x: number; y: number; size: number },
  area: Rect,
  opening: number,
  maxScale: number,
): Viewport {
  const side = footprint.size * CELL
  const scale =
    side * view.scale < FINGERTIP_PX
      ? Math.min(maxScale, Math.max(view.scale, opening, COMFORTABLE_CELL_PX / CELL))
      : view.scale
  return panTo({ ...view, scale }, { x: footprint.x + side / 2, y: footprint.y + side / 2 }, area)
}

/** Room kept between a token kept in view and the covered strip. */
export const KEEP_MARGIN = 8

/**
 * `keepInView`: when a token on screen lies (partly) under the covered strips, the view
 * panned just enough to show it whole in the area; else null. A token panned off the
 * screen on purpose stays there.
 */
export function keptInView(
  view: Viewport,
  footprint: { x: number; y: number; size: number },
  area: Rect,
  screen: Size,
  margin = KEEP_MARGIN,
): Viewport | null {
  const side = footprint.size * CELL * view.scale
  const left = footprint.x * view.scale + view.x
  const top = footprint.y * view.scale + view.y
  const rect = { left, top, right: left + side, bottom: top + side }
  const onScreen =
    rect.right > 0 && rect.left < screen.width && rect.bottom > 0 && rect.top < screen.height
  if (!onScreen) return null
  const shift = (low: number, high: number, min: number, max: number) => {
    if (high - low > max - min) return min - low
    if (low < min) return min - low
    if (high > max) return max - high
    return 0
  }
  const dx = shift(rect.left, rect.right, area.left + margin, area.right - margin)
  const dy = shift(rect.top, rect.bottom, area.top + margin, area.bottom - margin)
  if (dx === 0 && dy === 0) return null
  return { scale: view.scale, x: view.x + dx, y: view.y + dy }
}
