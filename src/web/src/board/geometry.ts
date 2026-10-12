// The grid rules every board feature shares: sparse cells, walkability, footprints
// and placement (knowledge/domain/battle-map.md, encounter.md "Placement rule",
// rules/creature-size.md). Stage 4's pathfinding builds on the same grid.
import type { BoardMap, BoardToken, CreatureSize, LayoutFeature, Terrain } from '../api/types'

export interface GridPoint {
  x: number
  y: number
}

/** A stable key for a cell, e.g. for highlight sets: cellKey(3, 4) → "3,4". */
export function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

const FOOTPRINT: Record<CreatureSize, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
}

/** Cells per side of a creature's square footprint: Large → 2. */
export function footprint(size: CreatureSize): number {
  return FOOTPRINT[size]
}

export interface MapGrid {
  readonly width: number
  readonly height: number
  /** The cell's terrain; cells missing from the layout and outside the map are void. */
  terrain(x: number, y: number): Terrain
  /** The topmost feature covering the cell, if any. */
  featureAt(x: number, y: number): LayoutFeature | undefined
  /**
   * Whether a creature can stand here: not void or wall and not under a blocking
   * feature. A non-blocking feature (a bridge) makes the cells under it walkable.
   */
  walkable(x: number, y: number): boolean
  /** Meters: a non-blocking feature's elevation where one covers the cell, else the cell's. */
  elevation(x: number, y: number): number
}

/** Indexes a map's layout for constant-time lookups. Build once per map, not per frame. */
export function buildGrid(map: Pick<BoardMap, 'width' | 'height' | 'layout'>): MapGrid {
  const { width, height, layout } = map
  const size = width * height
  const terrain: Terrain[] = new Array<Terrain>(size).fill('void')
  const cellElevation = new Float64Array(size)
  const features: (LayoutFeature | undefined)[] = new Array<LayoutFeature | undefined>(size)

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
  const index = (x: number, y: number) => y * width + x

  for (const cell of layout.cells) {
    if (!inside(cell.x, cell.y)) continue
    terrain[index(cell.x, cell.y)] = cell.terrain
    cellElevation[index(cell.x, cell.y)] = cell.elevation
  }
  // Later features in the list lie on top of earlier ones.
  for (const feature of layout.features) {
    for (let y = feature.y; y < feature.y + feature.h; y++) {
      for (let x = feature.x; x < feature.x + feature.w; x++) {
        if (inside(x, y)) features[index(x, y)] = feature
      }
    }
  }

  return {
    width,
    height,
    terrain: (x, y) => (inside(x, y) ? terrain[index(x, y)]! : 'void'),
    featureAt: (x, y) => (inside(x, y) ? features[index(x, y)] : undefined),
    walkable(x, y) {
      if (!inside(x, y)) return false
      const feature = features[index(x, y)]
      if (feature) return !feature.blocksMovement
      const t = terrain[index(x, y)]!
      return t !== 'void' && t !== 'wall'
    },
    elevation(x, y) {
      if (!inside(x, y)) return 0
      const feature = features[index(x, y)]
      if (feature && !feature.blocksMovement) return feature.elevation
      return cellElevation[index(x, y)]!
    },
  }
}

/** Every cell a token of this size covers with its top-left corner at (x, y). */
export function footprintCells(size: CreatureSize, x: number, y: number): GridPoint[] {
  const n = footprint(size)
  const cells: GridPoint[] = []
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) cells.push({ x: x + dx, y: y + dy })
  return cells
}

/** Every cell under a token, as cellKey strings. `ignoreTokenId` leaves out the token being moved. */
export function occupiedCells(
  tokens: ReadonlyArray<Pick<BoardToken, 'id' | 'x' | 'y' | 'size'>>,
  ignoreTokenId?: string,
): Set<string> {
  const taken = new Set<string>()
  for (const token of tokens) {
    if (token.id === ignoreTokenId) continue
    for (const cell of footprintCells(token.size, token.x, token.y))
      taken.add(cellKey(cell.x, cell.y))
  }
  return taken
}

/**
 * The placement rule against cells already taken (occupiedCells): the whole footprint
 * is inside the map on walkable cells and on none of them. Checking many cells, build
 * the taken set once and call this per cell.
 */
export function fitsAt(
  grid: MapGrid,
  taken: ReadonlySet<string>,
  size: CreatureSize,
  x: number,
  y: number,
): boolean {
  return footprintCells(size, x, y).every(
    (cell) => grid.walkable(cell.x, cell.y) && !taken.has(cellKey(cell.x, cell.y)),
  )
}

/**
 * The placement rule: the whole footprint is inside the map on walkable cells and
 * overlaps no other token. `ignoreTokenId` leaves out the token being moved.
 */
export function canPlace(
  grid: MapGrid,
  tokens: ReadonlyArray<Pick<BoardToken, 'id' | 'x' | 'y' | 'size'>>,
  size: CreatureSize,
  x: number,
  y: number,
  ignoreTokenId?: string,
): boolean {
  return fitsAt(grid, occupiedCells(tokens, ignoreTokenId), size, x, y)
}

/** A placed token's elevation: the highest elevation under its footprint. */
export function placementElevation(
  grid: MapGrid,
  size: CreatureSize,
  x: number,
  y: number,
): number {
  return Math.max(...footprintCells(size, x, y).map((cell) => grid.elevation(cell.x, cell.y)))
}

/**
 * The token whose footprint covers the cell, as drawn: later tokens lie on top of
 * earlier ones and the selected token on top of all.
 */
export function tokenAt<T extends Pick<BoardToken, 'id' | 'x' | 'y' | 'size'>>(
  tokens: readonly T[],
  cell: GridPoint,
  selectedTokenId?: string | null,
): T | undefined {
  const covers = (token: T) => {
    const n = footprint(token.size)
    return cell.x >= token.x && cell.y >= token.y && cell.x < token.x + n && cell.y < token.y + n
  }
  const selected = tokens.find((token) => token.id === selectedTokenId)
  if (selected && covers(selected)) return selected
  return tokens.findLast(covers)
}
