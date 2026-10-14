// Small maps for the feature and entrance tests.
import type { LayoutCell, LayoutEntrance, LayoutFeature } from '../../api/types'
import { emptyMap, type EditorMap } from '../model'

export const floor = (x: number, y: number): LayoutCell => ({
  x,
  y,
  terrain: 'floor',
  elevation: 0,
})

/** A pillar (blocking) unless `extra` says otherwise. */
export function feature(
  id: string,
  x: number,
  y: number,
  w = 1,
  h = 1,
  extra: Partial<LayoutFeature> = {},
): LayoutFeature {
  return { id, kind: 'Säule', label: '', x, y, w, h, elevation: 0, blocksMovement: true, ...extra }
}

/** A 10 × 8 map ("Klamm"), void unless cells are given. */
export function mapWith(
  features: LayoutFeature[] = [],
  cells: LayoutCell[] = [],
  entrances: LayoutEntrance[] = [],
): EditorMap {
  const base = emptyMap('Klamm', 10, 8)
  return { ...base, layout: { ...base.layout, cells, features, entrances } }
}

/** A 10 × 8 room of floor. */
export function roomCells(): LayoutCell[] {
  const cells: LayoutCell[] = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) cells.push(floor(x, y))
  return cells
}
