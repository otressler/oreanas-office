// Pure layout changes for the terrain and elevation tools and for resizing the map
// (knowledge/domain/battle-map.md, "Layout document"). Cells are sparse: a missing
// cell is void, each cell appears at most once, and the list stays sorted by y, then
// x, so saved layouts are stable. Every change returns the same object when nothing
// changes, so the editor store makes no empty undo steps.
import type { LayoutCell, Terrain } from '../../api/types'
import { cellKey, type GridPoint } from '../../board/geometry'
import { limits } from '../../lib/limits'
import { MIN_MAP_SIZE, type EditorMap } from '../model'

const byPosition = (a: LayoutCell, b: LayoutCell) => a.y - b.y || a.x - b.x

const insideMap = (doc: Pick<EditorMap, 'width' | 'height'>, x: number, y: number) =>
  x >= 0 && y >= 0 && x < doc.width && y < doc.height

/** The cells of the layout by cellKey. */
function cellIndex(doc: EditorMap): Map<string, LayoutCell> {
  return new Map(doc.layout.cells.map((cell) => [cellKey(cell.x, cell.y), cell]))
}

function withCells(doc: EditorMap, cells: Iterable<LayoutCell>): EditorMap {
  return { ...doc, layout: { ...doc.layout, cells: [...cells].sort(byPosition) } }
}

/** The terrain of a cell; missing cells and cells outside the map are void. */
export function terrainAt(doc: EditorMap, x: number, y: number): Terrain {
  if (!insideMap(doc, x, y)) return 'void'
  return doc.layout.cells.find((cell) => cell.x === x && cell.y === y)?.terrain ?? 'void'
}

/** A cell's own elevation in meters (features left out); 0 for void. */
export function elevationAt(doc: EditorMap, x: number, y: number): number {
  return doc.layout.cells.find((cell) => cell.x === x && cell.y === y)?.elevation ?? 0
}

/**
 * Paints the terrain on the cells inside the map. Void removes the cell (its
 * elevation goes too); another terrain keeps the cell's elevation.
 */
export function paintTerrain(
  doc: EditorMap,
  cells: Iterable<GridPoint>,
  terrain: Terrain,
): EditorMap {
  const index = cellIndex(doc)
  let changed = false
  for (const { x, y } of cells) {
    if (!insideMap(doc, x, y)) continue
    const key = cellKey(x, y)
    const cell = index.get(key)
    if (terrain === 'void') {
      if (cell) {
        index.delete(key)
        changed = true
      }
    } else if (!cell) {
      index.set(key, { x, y, terrain, elevation: 0 })
      changed = true
    } else if (cell.terrain !== terrain) {
      index.set(key, { ...cell, terrain })
      changed = true
    }
  }
  return changed ? withCells(doc, index.values()) : doc
}

/** Sets the elevation on the cells that are part of the map; void cells are skipped. */
export function paintElevation(
  doc: EditorMap,
  cells: Iterable<GridPoint>,
  meters: number,
): EditorMap {
  const index = cellIndex(doc)
  let changed = false
  for (const { x, y } of cells) {
    const key = cellKey(x, y)
    const cell = index.get(key)
    if (!cell || !insideMap(doc, x, y) || cell.elevation === meters) continue
    index.set(key, { ...cell, elevation: meters })
    changed = true
  }
  return changed ? withCells(doc, index.values()) : doc
}

/**
 * The cells on a straight line from a to b, both included (Bresenham), so a fast
 * brush stroke leaves no gaps between the cells the pointer reported.
 */
export function lineCells(a: GridPoint, b: GridPoint): GridPoint[] {
  const cells: GridPoint[] = []
  const dx = Math.abs(b.x - a.x)
  const dy = -Math.abs(b.y - a.y)
  const sx = a.x < b.x ? 1 : -1
  const sy = a.y < b.y ? 1 : -1
  let { x, y } = a
  let error = dx + dy
  for (;;) {
    cells.push({ x, y })
    if (x === b.x && y === b.y) return cells
    const e2 = 2 * error
    if (e2 >= dy) {
      error += dy
      x += sx
    }
    if (e2 <= dx) {
      error += dx
      y += sy
    }
  }
}

export interface CellRect {
  x: number
  y: number
  w: number
  h: number
}

/** The rectangle spanned by two corner cells in any order, clipped to the map; null if outside. */
export function rectBetween(
  doc: Pick<EditorMap, 'width' | 'height'>,
  a: GridPoint,
  b: GridPoint,
): CellRect | null {
  const x0 = Math.max(0, Math.min(a.x, b.x))
  const y0 = Math.max(0, Math.min(a.y, b.y))
  const x1 = Math.min(doc.width - 1, Math.max(a.x, b.x))
  const y1 = Math.min(doc.height - 1, Math.max(a.y, b.y))
  if (x1 < x0 || y1 < y0) return null
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Every cell of a rectangle. */
export function rectCells(rect: CellRect): GridPoint[] {
  const cells: GridPoint[] = []
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) cells.push({ x, y })
  return cells
}

/**
 * The connected area of the start cell's terrain (four neighbours), within the map.
 * Void counts as a terrain, so empty space can be filled too.
 */
export function floodArea(doc: EditorMap, start: GridPoint): GridPoint[] {
  if (!insideMap(doc, start.x, start.y)) return []
  const { width, height } = doc
  const terrain: Terrain[] = new Array<Terrain>(width * height).fill('void')
  for (const cell of doc.layout.cells)
    if (insideMap(doc, cell.x, cell.y)) terrain[cell.y * width + cell.x] = cell.terrain
  const target = terrain[start.y * width + start.x]
  const seen = new Uint8Array(width * height)
  const area: GridPoint[] = []
  const stack: GridPoint[] = [start]
  seen[start.y * width + start.x] = 1
  while (stack.length > 0) {
    const cell = stack.pop()!
    area.push(cell)
    for (const [nx, ny] of [
      [cell.x + 1, cell.y],
      [cell.x - 1, cell.y],
      [cell.x, cell.y + 1],
      [cell.x, cell.y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const i = ny * width + nx
      if (seen[i] || terrain[i] !== target) continue
      seen[i] = 1
      stack.push({ x: nx, y: ny })
    }
  }
  return area
}

/** Columns and rows to add (positive) or remove (negative) at each edge. */
export interface ResizeEdges {
  left: number
  right: number
  top: number
  bottom: number
}

/** The map's size after resizing. */
export function resizedSize(doc: Pick<EditorMap, 'width' | 'height'>, edges: ResizeEdges) {
  return {
    width: doc.width + edges.left + edges.right,
    height: doc.height + edges.top + edges.bottom,
  }
}

/** Whether the resized map stays within 1 and limits.mapSize cells per side. */
export function canResize(doc: Pick<EditorMap, 'width' | 'height'>, edges: ResizeEdges): boolean {
  const { width, height } = resizedSize(doc, edges)
  const ok = (n: number) => Number.isInteger(n) && n >= MIN_MAP_SIZE && n <= limits.mapSize
  return ok(width) && ok(height)
}

/**
 * Adds or removes rows and columns at the edges. Everything shifts by left and top;
 * new cells are void; cells outside the new grid are dropped, and so are features
 * that no longer lie completely inside. Entrance cells outside are dropped and an
 * entrance left without cells is removed; entrance cells no longer on the edge stay
 * (the layout checks flag them). A size outside the limits leaves the map as it is.
 */
export function resizeMap(doc: EditorMap, edges: ResizeEdges): EditorMap {
  if (!canResize(doc, edges)) return doc
  const { left: dx, top: dy } = edges
  const size = resizedSize(doc, edges)
  if (dx === 0 && dy === 0 && size.width === doc.width && size.height === doc.height) return doc

  const inside = (x: number, y: number) => insideMap(size, x, y)
  const cells = doc.layout.cells
    .map((cell) => ({ ...cell, x: cell.x + dx, y: cell.y + dy }))
    .filter((cell) => inside(cell.x, cell.y))
    .sort(byPosition)
  const features = doc.layout.features
    .map((feature) => ({ ...feature, x: feature.x + dx, y: feature.y + dy }))
    .filter((f) => inside(f.x, f.y) && inside(f.x + f.w - 1, f.y + f.h - 1))
  const entrances = doc.layout.entrances
    .map((entrance) => ({
      ...entrance,
      cells: entrance.cells
        .map(([x = 0, y = 0]) => [x + dx, y + dy])
        .filter(([x, y]) => inside(x!, y!)),
    }))
    .filter((entrance) => entrance.cells.length > 0)

  return { ...doc, ...size, layout: { ...doc.layout, cells, features, entrances } }
}

/** A column or row count as typed in the resize panel ("2", "-3", "+1"); empty counts as 0, anything else is null. */
export function parseEdge(input: string): number | null {
  const text = input.trim().replace(/^[−–]/, '-')
  if (text === '') return 0
  return /^[+-]?\d{1,3}$/.test(text) ? Number(text) + 0 : null
}

/** What a resize would remove: features and whole entrances. */
export function resizeLosses(doc: EditorMap, edges: ResizeEdges) {
  const after = resizeMap(doc, edges)
  return {
    features: doc.layout.features.length - after.layout.features.length,
    entrances: doc.layout.entrances.length - after.layout.entrances.length,
  }
}

const signedElevation = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** Short labels for every cell with a non-zero elevation: "+1,5", "-3". */
export function elevationLabels(doc: EditorMap): { x: number; y: number; text: string }[] {
  return doc.layout.cells
    .filter((cell) => cell.elevation !== 0 && insideMap(doc, cell.x, cell.y))
    .map((cell) => ({ x: cell.x, y: cell.y, text: signedElevation.format(cell.elevation) }))
}
