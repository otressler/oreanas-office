// Pure changes to a map's features and entrances, and the rules the tools check before
// making them (knowledge/domain/battle-map.md, "Layout document"). Each change returns
// the same map object when nothing changes, so the store makes no undo step for it.
import type { LayoutEntrance, LayoutFeature } from '../../api/types'
import { buildGrid, cellKey, type GridPoint } from '../../board/geometry'
import { limits } from '../../lib/limits'
import { nextLayoutId, type EditorMap } from '../model'
import { isEdgeCell, rectInside, rectsOverlap, type Rect } from '../validation'

export type EntranceKind = LayoutEntrance['kind']

/** A feature's properties apart from its id. */
export type FeatureProps = Omit<LayoutFeature, 'id'>

/** The rectangle spanned by two corner cells, in either order. */
export function rectBetween(a: GridPoint, b: GridPoint): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }
}

/** Why a footprint can't be used: outside the grid, or over another feature. */
export type FootprintProblem = 'outside' | 'overlap'

/**
 * Whether a feature may have this footprint: inside the grid and over no other feature
 * (`ignoreId` leaves out the feature being moved). Void and walls below are fine.
 */
export function footprintProblem(
  map: EditorMap,
  rect: Rect,
  ignoreId?: string,
): FootprintProblem | null {
  const whole = [rect.x, rect.y, rect.w, rect.h].every(Number.isInteger)
  if (!whole || !rectInside(rect, map.width, map.height)) return 'outside'
  const hit = map.layout.features.some((f) => f.id !== ignoreId && rectsOverlap(rect, f))
  return hit ? 'overlap' : null
}

export function footprintFits(map: EditorMap, rect: Rect, ignoreId?: string): boolean {
  return footprintProblem(map, rect, ignoreId) === null
}

/** The feature drawn on top at the cell: the latest in the list that covers it. */
export function featureAtCell(map: EditorMap, cell: GridPoint): LayoutFeature | undefined {
  return map.layout.features.findLast(
    (f) => cell.x >= f.x && cell.y >= f.y && cell.x < f.x + f.w && cell.y < f.y + f.h,
  )
}

/** The entrance a cell belongs to. */
export function entranceAtCell(map: EditorMap, cell: GridPoint): LayoutEntrance | undefined {
  return map.layout.entrances.find((e) => e.cells.some(([x, y]) => x === cell.x && y === cell.y))
}

const withFeatures = (map: EditorMap, features: LayoutFeature[]): EditorMap => ({
  ...map,
  layout: { ...map.layout, features },
})

const withEntrances = (map: EditorMap, entrances: LayoutEntrance[]): EditorMap => ({
  ...map,
  layout: { ...map.layout, entrances },
})

/** Adds a feature with a new id ("f3"); returns the map and the id. */
export function addFeature(map: EditorMap, props: FeatureProps): { map: EditorMap; id: string } {
  const id = nextLayoutId('f', map.layout.features)
  return { map: withFeatures(map, [...map.layout.features, { ...props, id }]), id }
}

/** Changes a feature's properties; the same map when it doesn't exist or nothing changes. */
export function updateFeature(map: EditorMap, id: string, patch: Partial<FeatureProps>): EditorMap {
  const index = map.layout.features.findIndex((f) => f.id === id)
  const feature = map.layout.features[index]
  if (!feature) return map
  const keys = Object.keys(patch) as (keyof FeatureProps)[]
  if (keys.every((key) => patch[key] === undefined || patch[key] === feature[key])) return map
  const features = [...map.layout.features]
  features[index] = { ...feature, ...patch }
  return withFeatures(map, features)
}

/** Moves a feature's top-left corner to the cell. */
export function moveFeature(map: EditorMap, id: string, to: GridPoint): EditorMap {
  return updateFeature(map, id, { x: to.x, y: to.y })
}

export function removeFeature(map: EditorMap, id: string): EditorMap {
  const features = map.layout.features.filter((f) => f.id !== id)
  return features.length === map.layout.features.length ? map : withFeatures(map, features)
}

/** Adds an entrance with a new id ("e2"); returns the map and the id. */
export function addEntrance(
  map: EditorMap,
  props: { kind: EntranceKind; label: string; cells: readonly GridPoint[] },
): { map: EditorMap; id: string } {
  const id = nextLayoutId('e', map.layout.entrances)
  const entrance: LayoutEntrance = {
    id,
    kind: props.kind,
    label: props.label,
    cells: props.cells.map((c) => [c.x, c.y]),
  }
  return { map: withEntrances(map, [...map.layout.entrances, entrance]), id }
}

export function updateEntrance(
  map: EditorMap,
  id: string,
  patch: Partial<Pick<LayoutEntrance, 'kind' | 'label'>>,
): EditorMap {
  const index = map.layout.entrances.findIndex((e) => e.id === id)
  const entrance = map.layout.entrances[index]
  if (!entrance) return map
  if (
    (patch.kind === undefined || patch.kind === entrance.kind) &&
    (patch.label === undefined || patch.label === entrance.label)
  )
    return map
  const entrances = [...map.layout.entrances]
  entrances[index] = { ...entrance, ...patch }
  return withEntrances(map, entrances)
}

export function removeEntrance(map: EditorMap, id: string): EditorMap {
  const entrances = map.layout.entrances.filter((e) => e.id !== id)
  return entrances.length === map.layout.entrances.length ? map : withEntrances(map, entrances)
}

/** Removes the selected feature or entrance. */
export function removeItem(
  map: EditorMap,
  item: { kind: 'feature' | 'entrance'; id: string },
): EditorMap {
  return item.kind === 'feature' ? removeFeature(map, item.id) : removeEntrance(map, item.id)
}

/** Why a cell can't become part of a new entrance. */
export type EntranceCellProblem = 'outside' | 'notOnEdge' | 'notWalkable' | 'taken'

/**
 * Splits cells into those a new entrance may take and those it refuses: a cell is
 * taken when it lies on the outer edge, a token may stand on it, and no entrance has it
 * yet. Each cell appears once, in the order given.
 */
export function entranceCells(
  map: EditorMap,
  cells: readonly GridPoint[],
): { take: GridPoint[]; refuse: GridPoint[] } {
  const grid = buildGrid(map)
  const taken = new Set<string>()
  for (const entrance of map.layout.entrances)
    for (const [x = NaN, y = NaN] of entrance.cells) taken.add(cellKey(x, y))
  const seen = new Set<string>()
  const take: GridPoint[] = []
  const refuse: GridPoint[] = []
  for (const cell of cells) {
    const key = cellKey(cell.x, cell.y)
    if (seen.has(key)) continue
    seen.add(key)
    const ok =
      isEdgeCell(cell.x, cell.y, map.width, map.height) &&
      grid.walkable(cell.x, cell.y) &&
      !taken.has(key)
    ;(ok ? take : refuse).push(cell)
  }
  return { take, refuse }
}

/** The cells on a straight line from one cell to another, both included (Bresenham). */
export function cellsAlong(from: GridPoint, to: GridPoint): GridPoint[] {
  const cells: GridPoint[] = []
  const dx = Math.abs(to.x - from.x)
  const dy = -Math.abs(to.y - from.y)
  const sx = from.x < to.x ? 1 : -1
  const sy = from.y < to.y ? 1 : -1
  let { x, y } = from
  let err = dx + dy
  for (;;) {
    cells.push({ x, y })
    if (x === to.x && y === to.y) return cells
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

const elevationInput = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
  useGrouping: false,
})

/** An elevation as the value of an input field, without unit: -1.5 → "-1,5". */
export function formatElevationInput(meters: number): string {
  return elevationInput.format(Math.round(meters * 10) / 10 + 0)
}

/**
 * An elevation as typed: "2", "-1,5", "1.5", "0,5 m". Rounded to one decimal. Null for
 * anything else, and for heights at or beyond limits.elevation.
 */
export function parseElevationInput(text: string): number | null {
  const normalized = text.trim().replace(/\s*m$/i, '').replace(',', '.').replace('−', '-')
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null
  const meters = Math.round(Number(normalized) * 10) / 10 + 0
  return Math.abs(meters) < limits.elevation ? meters : null
}

/** A whole number of cells as typed; null for anything else. */
export function parseCellsInput(text: string): number | null {
  const normalized = text.trim()
  return /^-?\d+$/.test(normalized) ? Number(normalized) : null
}
