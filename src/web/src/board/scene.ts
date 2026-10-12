// Everything the board draws that depends only on the map, worked out once per map:
// fill groups per terrain, pattern cells, edge lines (grid, rims, elevation steps), and the
// look of features and entrances. Drawing then only walks these lists.
import type { BoardMap, LayoutEntrance, LayoutFeature } from '../api/types'
import { buildGrid, type GridPoint, type MapGrid } from './geometry'
import { FLOOR_TONES, TERRAIN_COLORS } from './palette'

/** An axis-aligned line along cell edges, in cell units. */
export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Cells drawn in one colour, as a flat list of x, y pairs. */
export interface FillGroup {
  color: string
  cells: number[]
}

/** A horizontal run of water cells in one row, for continuous waves. */
export interface Run {
  y: number
  x0: number
  /** Exclusive. */
  x1: number
}

export type FeatureStyle =
  'stone' | 'tree' | 'wood' | 'well' | 'bridge' | 'door' | 'stairs' | 'surface'

export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface SceneFeature {
  feature: LayoutFeature
  style: FeatureStyle
}

export interface SceneEntrance {
  entrance: LayoutEntrance
  /** The map edge the entrance leads out through. */
  side: Side | null
  cells: GridPoint[]
}

export interface MapScene {
  width: number
  height: number
  grid: MapGrid
  /** Part of the map: not void, or covered by a feature (a bridge over a gorge). */
  inMap(x: number, y: number): boolean
  /** Every non-void cell: one base fill underneath, so colour groups never show seams. */
  baseCells: number[]
  fills: FillGroup[]
  difficultCells: number[]
  waterRuns: Run[]
  wallCells: number[]
  /** Lighter (higher) or darker (lower) overlays by elevation. */
  shades: FillGroup[]
  /** Grid lines: every edge that touches an open cell, so walls and void stay calm. */
  gridLines: Segment[]
  /** Where open ground meets void or a wall. */
  rims: Segment[]
  /**
   * Steps between open cells on different whole meters of elevation, split by which
   * side is higher: `a` (the cell above or left of the edge) or `b`.
   */
  steps: { higherA: Segment[]; higherB: Segment[] }
  features: SceneFeature[]
  entrances: SceneEntrance[]
  entranceAt(x: number, y: number): LayoutEntrance | undefined
}

/**
 * Merged edge lines across the grid. `test(a, b)` decides each edge from the two
 * cells on either side (a above or left of b); cells outside the map can be asked.
 */
export function edgeSegments(
  width: number,
  height: number,
  test: (a: GridPoint, b: GridPoint) => boolean,
): Segment[] {
  const segments: Segment[] = []
  for (let y = 0; y <= height; y++) {
    let start = -1
    for (let x = 0; x <= width; x++) {
      const on = x < width && test({ x, y: y - 1 }, { x, y })
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        segments.push({ x1: start, y1: y, x2: x, y2: y })
        start = -1
      }
    }
  }
  for (let x = 0; x <= width; x++) {
    let start = -1
    for (let y = 0; y <= height; y++) {
      const on = y < height && test({ x: x - 1, y }, { x, y })
      if (on && start < 0) start = y
      if (!on && start >= 0) {
        segments.push({ x1: x, y1: start, x2: x, y2: y })
        start = -1
      }
    }
  }
  return segments
}

// Feature kinds are free text (English in the samples, German from DMs), so match
// keywords; German compounds ("Hängebrücke", "Falltür") need substring matches.
const KIND_STYLES: [RegExp, FeatureStyle][] = [
  [/bridge|brücke|\bsteg/i, 'bridge'],
  [/door|gate|tür|\btor\b/i, 'door'],
  [/stair|treppe|stufe/i, 'stairs'],
  [/tree|baum|eiche|weide|bush|busch|strauch/i, 'tree'],
  [/well|brunnen/i, 'well'],
  [/wagon|wagen|cart|karren|crate|kiste|table|tisch|barrel|fass/i, 'wood'],
]

/** How a feature is drawn: by kind, else as a stone block (blocking) or a plain surface. */
export function featureStyle(
  feature: Pick<LayoutFeature, 'kind' | 'blocksMovement'>,
): FeatureStyle {
  for (const [pattern, style] of KIND_STYLES) if (pattern.test(feature.kind)) return style
  return feature.blocksMovement ? 'stone' : 'surface'
}

/** The map edge most of the entrance's cells lie on, or null if none does. */
export function entranceSide(cells: number[][], width: number, height: number): Side | null {
  const counts: Record<Side, number> = { left: 0, right: 0, top: 0, bottom: 0 }
  for (const [x, y] of cells) {
    if (x === 0) counts.left++
    if (x === width - 1) counts.right++
    if (y === 0) counts.top++
    if (y === height - 1) counts.bottom++
  }
  let best: Side | null = null
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    if (counts[side] > 0 && (best === null || counts[side] > counts[best])) best = side
  }
  return best
}

/** A stable pseudo-random number per cell, for the floor's tile tones. */
function cellHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** How much a cell is lightened (positive) or darkened (negative) by its elevation. */
export function elevationShade(meters: number): number {
  // Half-meter buckets keep the number of fill groups small.
  const bucket = Math.round(meters * 2) / 2
  if (bucket > 0) return Math.min(0.035 * bucket, 0.2)
  if (bucket < 0) return Math.max(0.06 * bucket, -0.3)
  return 0
}

export function buildScene(map: Pick<BoardMap, 'width' | 'height' | 'layout'>): MapScene {
  const { width, height, layout } = map
  const grid = buildGrid(map)
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
  const inMap = (x: number, y: number) =>
    inside(x, y) && (grid.terrain(x, y) !== 'void' || grid.featureAt(x, y) !== undefined)
  // Open ground: in the map and not wall (a door or bridge over a wall counts as open).
  const open = (x: number, y: number) => {
    if (!inMap(x, y)) return false
    const feature = grid.featureAt(x, y)
    if (feature && !feature.blocksMovement) return true
    return grid.terrain(x, y) !== 'wall'
  }
  const level = (x: number, y: number) => Math.floor(grid.elevation(x, y) + 1e-6)

  const baseCells: number[] = []
  const floorTones: number[][] = FLOOR_TONES.map(() => [])
  const difficultCells: number[] = []
  const wallCells: number[] = []
  const waterCells: number[] = []
  const waterRuns: Run[] = []
  const shadeGroups = new Map<number, number[]>()

  for (let y = 0; y < height; y++) {
    let waterStart = -1
    for (let x = 0; x <= width; x++) {
      const terrain = x < width ? grid.terrain(x, y) : 'void'
      if (terrain === 'water' && waterStart < 0) waterStart = x
      if (terrain !== 'water' && waterStart >= 0) {
        waterRuns.push({ y, x0: waterStart, x1: x })
        waterStart = -1
      }
      if (x === width || terrain === 'void') continue
      baseCells.push(x, y)
      if (terrain === 'floor') {
        const h = cellHash(x, y)
        floorTones[h < 0.6 ? 0 : h < 0.8 ? 1 : 2]!.push(x, y)
      } else if (terrain === 'difficult') difficultCells.push(x, y)
      else if (terrain === 'water') waterCells.push(x, y)
      else if (terrain === 'wall') wallCells.push(x, y)
      if (terrain !== 'wall') {
        const shade = elevationShade(grid.elevation(x, y))
        if (shade !== 0) {
          const cells = shadeGroups.get(shade) ?? []
          cells.push(x, y)
          shadeGroups.set(shade, cells)
        }
      }
    }
  }

  const fills: FillGroup[] = [
    ...FLOOR_TONES.map((color, i) => ({ color, cells: floorTones[i]! })),
    { color: TERRAIN_COLORS.difficult, cells: difficultCells },
    { color: TERRAIN_COLORS.water, cells: waterCells },
    { color: TERRAIN_COLORS.wall, cells: wallCells },
  ]

  const shades: FillGroup[] = [...shadeGroups].map(([shade, cells]) => ({
    color: shade > 0 ? `rgba(255, 246, 224, ${shade})` : `rgba(0, 0, 0, ${-shade})`,
    cells,
  }))

  const entranceCells = new Map<string, LayoutEntrance>()
  const entrances: SceneEntrance[] = layout.entrances.map((entrance) => {
    const cells = entrance.cells
      .filter((cell) => cell.length >= 2 && inside(cell[0]!, cell[1]!))
      .map(([x, y]) => ({ x: x!, y: y! }))
    for (const cell of cells) entranceCells.set(`${cell.x},${cell.y}`, entrance)
    return { entrance, side: entranceSide(entrance.cells, width, height), cells }
  })

  return {
    width,
    height,
    grid,
    inMap,
    baseCells,
    fills,
    difficultCells,
    waterRuns,
    wallCells,
    shades,
    gridLines: edgeSegments(width, height, (a, b) => open(a.x, a.y) || open(b.x, b.y)),
    rims: edgeSegments(width, height, (a, b) => open(a.x, a.y) !== open(b.x, b.y)),
    steps: {
      higherA: edgeSegments(
        width,
        height,
        (a, b) => open(a.x, a.y) && open(b.x, b.y) && level(a.x, a.y) > level(b.x, b.y),
      ),
      higherB: edgeSegments(
        width,
        height,
        (a, b) => open(a.x, a.y) && open(b.x, b.y) && level(a.x, a.y) < level(b.x, b.y),
      ),
    },
    features: layout.features.map((feature) => ({ feature, style: featureStyle(feature) })),
    entrances,
    entranceAt: (x, y) => entranceCells.get(`${x},${y}`),
  }
}

/** Shaded cells and the outline around them (setup targets now, reach in stage 4). */
export interface HighlightScene {
  cells: number[]
  outline: Segment[]
}

/** Parses the cellKey strings inside the map; null when there's nothing to shade. */
export function buildHighlight(
  keys: ReadonlySet<string> | undefined,
  width: number,
  height: number,
): HighlightScene | null {
  if (!keys || keys.size === 0) return null
  const on = new Uint8Array(width * height)
  const cells: number[] = []
  for (const key of keys) {
    const [x, y] = key.split(',').map(Number)
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue
    if (x! < 0 || y! < 0 || x! >= width || y! >= height || on[y! * width + x!]) continue
    on[y! * width + x!] = 1
    cells.push(x!, y!)
  }
  if (cells.length === 0) return null
  const has = (p: GridPoint) =>
    p.x >= 0 && p.y >= 0 && p.x < width && p.y < height && on[p.y * width + p.x] === 1
  return { cells, outline: edgeSegments(width, height, (a, b) => has(a) !== has(b)) }
}
