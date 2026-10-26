// Drawing fog of war on the board (knowledge/features/fog-of-war.md, "What players see"),
// in plain canvas calls like the rest of render.ts. Players get an opaque, slightly cloudy
// dark cover with no grid, terrain or elevation under it and an edge softened towards the
// revealed side. The session DM's own view only dims hidden cells and hatches them, so the
// map stays readable. Cells that are fading (fog/fade.ts) are drawn one by one with their
// current opacity; steady ones in a single path. A hidden creature is drawn see-through
// with a closed eye (drawHiddenMark in render.ts).
import { fogOpacity, type FogFades } from '../fog/fade'
import type { CellSet } from '../fog/cells'
import { parseKey } from '../fog/cells'
import { cellKey, type GridPoint } from './geometry'
import { visibleCells, type CellRect } from './render'
import { CELL } from './viewport'

/** Who the fog is drawn for: players (opaque), or the session DM (hatched, map visible). */
export type FogLook = 'player' | 'dm'

/** The fog as the board draws it. */
export interface BoardFog {
  /** The hidden cells, as cellKey strings. */
  hidden: CellSet
  look: FogLook
}

export interface FogScene {
  width: number
  height: number
  set: CellSet
  cells: GridPoint[]
}

/** The hidden cells inside the map, once per fog. */
export function buildFogScene(hidden: CellSet, width: number, height: number): FogScene {
  const cells: GridPoint[] = []
  for (const key of hidden) {
    const cell = parseKey(key)
    if (cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height) cells.push(cell)
  }
  return { width, height, set: hidden, cells }
}

const FOG_BASE = '#0a0c11'
/** Two slightly lighter tones, picked per cell, so the cover looks cloudy and not flat. */
const FOG_TONES = ['rgba(48, 56, 74, 0.34)', 'rgba(30, 35, 48, 0.4)'] as const
const DM_DIM = 'rgba(6, 7, 10, 0.5)'
const DM_HATCH = 'rgba(236, 230, 216, 0.26)'
/** How far the softened edge reaches into the revealed neighbour, in cells. */
const EDGE = 0.5
const HATCH_PX = 9

/** A stable pseudo-random number per cell. */
function cellHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 83492791) ^ Math.imul(y + 1, 2654435761)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

const inView = (view: CellRect, x: number, y: number) =>
  x >= view.x0 && x < view.x1 && y >= view.y0 && y < view.y1

function rects(ctx: CanvasRenderingContext2D, cells: readonly GridPoint[]) {
  ctx.beginPath()
  for (const { x, y } of cells) ctx.rect(x * CELL, y * CELL, CELL, CELL)
}

function drawPlayerCover(ctx: CanvasRenderingContext2D, cells: readonly GridPoint[]) {
  rects(ctx, cells)
  ctx.fillStyle = FOG_BASE
  ctx.fill()
  FOG_TONES.forEach((tone, i) => {
    const group = cells.filter((cell) => {
      const h = cellHash(cell.x, cell.y)
      return i === 0 ? h < 0.35 : h >= 0.35 && h < 0.7
    })
    if (group.length === 0) return
    rects(ctx, group)
    ctx.fillStyle = tone
    ctx.fill()
  })
}

function drawDmCover(ctx: CanvasRenderingContext2D, cells: readonly GridPoint[], cssScale: number) {
  rects(ctx, cells)
  ctx.fillStyle = DM_DIM
  ctx.fill()
  ctx.save()
  ctx.clip()
  // Diagonal lines over the cells' bounding box, clipped to the cells.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { x, y } of cells) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x + 1)
    y1 = Math.max(y1, y + 1)
  }
  const step = HATCH_PX / cssScale
  const [left, top, right, bottom] = [x0 * CELL, y0 * CELL, x1 * CELL, y1 * CELL]
  ctx.beginPath()
  for (let d = left - (bottom - top); d < right; d += step) {
    ctx.moveTo(d, bottom)
    ctx.lineTo(d + (bottom - top), top)
  }
  ctx.strokeStyle = DM_HATCH
  ctx.lineWidth = 1.25 / cssScale
  ctx.stroke()
  ctx.restore()
}

/** A strip along a fogged cell's edge, fading out into the revealed neighbour. */
function drawEdge(
  ctx: CanvasRenderingContext2D,
  from: GridPoint,
  towards: GridPoint,
  alpha: number,
) {
  const dx = towards.x - from.x
  const dy = towards.y - from.y
  // The strip lies in the neighbour; the gradient runs from the shared edge outwards.
  const sx = dx > 0 ? towards.x * CELL : dx < 0 ? (towards.x + 1) * CELL : towards.x * CELL
  const sy = dy > 0 ? towards.y * CELL : dy < 0 ? (towards.y + 1) * CELL : towards.y * CELL
  const length = CELL * EDGE
  const gradient = ctx.createLinearGradient(sx, sy, sx + dx * length, sy + dy * length)
  gradient.addColorStop(0, `rgba(10, 12, 17, ${0.8 * alpha})`)
  gradient.addColorStop(1, 'rgba(10, 12, 17, 0)')
  ctx.fillStyle = gradient
  const x = dx < 0 ? towards.x * CELL + CELL - length : towards.x * CELL
  const y = dy < 0 ? towards.y * CELL + CELL - length : towards.y * CELL
  ctx.fillRect(x, y, dx !== 0 ? length : CELL, dy !== 0 ? length : CELL)
}

/**
 * The fog over the map. `fades` are the cells whose fog is fading in or away; `now` is
 * performance.now(). Culls to the cells the canvas shows.
 */
export function drawFog(
  ctx: CanvasRenderingContext2D,
  scene: FogScene,
  look: FogLook,
  fades: FogFades,
  now: number,
  cssScale: number,
): void {
  const m = ctx.getTransform()
  const view = visibleCells(m, ctx.canvas.width, ctx.canvas.height, scene.width, scene.height)
  const opacityOf = (x: number, y: number) => {
    const key = cellKey(x, y)
    return fogOpacity(scene.set.has(key), fades.get(key), now)
  }

  const steady: GridPoint[] = []
  const fading: { cell: GridPoint; opacity: number }[] = []
  const consider = (cell: GridPoint) => {
    if (!inView(view, cell.x, cell.y)) return
    const opacity = opacityOf(cell.x, cell.y)
    if (opacity >= 1) steady.push(cell)
    else if (opacity > 0) fading.push({ cell, opacity })
  }
  for (const cell of scene.cells) consider(cell)
  // Cells whose fog is on its way out are no longer hidden but still drawn.
  for (const key of fades.keys()) if (!scene.set.has(key)) consider(parseKey(key))

  ctx.save()
  const cover = (cells: readonly GridPoint[]) =>
    look === 'player' ? drawPlayerCover(ctx, cells) : drawDmCover(ctx, cells, cssScale)
  if (steady.length > 0) cover(steady)
  for (const { cell, opacity } of fading) {
    ctx.globalAlpha = opacity
    cover([cell])
  }
  ctx.globalAlpha = 1

  if (look === 'player') {
    // Softened edges, drawn on the revealed side of every covered cell.
    const covered = [...steady, ...fading.map((f) => f.cell)]
    for (const cell of covered) {
      const own = opacityOf(cell.x, cell.y)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = { x: cell.x + dx, y: cell.y + dy }
        if (next.x < 0 || next.y < 0 || next.x >= scene.width || next.y >= scene.height) continue
        const alpha = own * (1 - opacityOf(next.x, next.y))
        if (alpha > 0) drawEdge(ctx, cell, next, alpha)
      }
    }
  }
  ctx.restore()
}
