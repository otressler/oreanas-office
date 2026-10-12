// Viewport math for the board: the stage transform from world units to CSS pixels,
// fit to screen, zoom around a point and clamping. Pure functions, so gestures and
// buttons share them and tests can check them without a canvas.
import type { GridPoint } from './geometry'

/** World units per grid cell. The board draws in world units; the stage scales them. */
export const CELL = 64

/** The closest zoom: one cell about this many CSS pixels wide. */
export const MAX_CELL_PX = 160

/** Space around the map when it's fitted to the screen, in CSS pixels. */
export const FIT_PADDING = 12

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** screen = world × scale + (x, y), all in CSS pixels. */
export interface Viewport {
  scale: number
  x: number
  y: number
}

export interface ZoomLimits {
  min: number
  max: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The map's size in world units. */
export function worldSize(width: number, height: number): Size {
  return { width: width * CELL, height: height * CELL }
}

/** The whole map, as large as fits, centred. */
export function fitViewport(world: Size, screen: Size, padding = FIT_PADDING): Viewport {
  const room = {
    width: Math.max(1, screen.width - 2 * padding),
    height: Math.max(1, screen.height - 2 * padding),
  }
  const scale = Math.min(room.width / world.width, room.height / world.height)
  return {
    scale,
    x: (screen.width - world.width * scale) / 2,
    y: (screen.height - world.height * scale) / 2,
  }
}

/** From half the fit scale out to a cell of MAX_CELL_PX (or the fit, if that's closer). */
export function zoomLimits(world: Size, screen: Size): ZoomLimits {
  const fit = fitViewport(world, screen).scale
  return { min: fit / 2, max: Math.max(MAX_CELL_PX / CELL, fit) }
}

/** Zooms by `factor` while the world point under `point` stays where it is. */
export function zoomAt(view: Viewport, point: Point, factor: number, limits: ZoomLimits): Viewport {
  const scale = clamp(view.scale * factor, limits.min, limits.max)
  const k = scale / view.scale
  return { scale, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k }
}

/**
 * Keeps the map findable: it always covers the middle of the screen. Its edges can
 * come in up to half the screen, so a corner cell can still be brought to the centre.
 */
export function clampPan(view: Viewport, world: Size, screen: Size): Viewport {
  const w = world.width * view.scale
  const h = world.height * view.scale
  return {
    scale: view.scale,
    x: clamp(view.x, screen.width / 2 - w, screen.width / 2),
    y: clamp(view.y, screen.height / 2 - h, screen.height / 2),
  }
}

/** Scale within the limits (keeping the screen centre in place), then pan within bounds. */
export function clampViewport(view: Viewport, world: Size, screen: Size): Viewport {
  const limits = zoomLimits(world, screen)
  const centre = { x: screen.width / 2, y: screen.height / 2 }
  const zoomed = zoomAt(view, centre, 1, limits)
  return clampPan(zoomed, world, screen)
}

export function screenToWorld(view: Viewport, point: Point): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale }
}

export function worldToScreen(view: Viewport, point: Point): Point {
  return { x: point.x * view.scale + view.x, y: point.y * view.scale + view.y }
}

/** The grid cell under a screen point. It can lie outside the map. */
export function screenToCell(view: Viewport, point: Point): GridPoint {
  const world = screenToWorld(view, point)
  return { x: Math.floor(world.x / CELL), y: Math.floor(world.y / CELL) }
}

/**
 * After a resize: keep the same zoom and the same world point in the middle of
 * the screen, then clamp to the new screen.
 */
export function keepCentre(view: Viewport, before: Size, after: Size, world: Size): Viewport {
  const centre = screenToWorld(view, { x: before.width / 2, y: before.height / 2 })
  const moved = {
    scale: view.scale,
    x: after.width / 2 - centre.x * view.scale,
    y: after.height / 2 - centre.y * view.scale,
  }
  return clampViewport(moved, world, after)
}
