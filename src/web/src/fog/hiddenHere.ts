// "Alle verborgenen hier" on a creature's token card (knowledge/features/fog-of-war.md):
// select the first hidden creature, then reveal every hidden creature inside the same
// area or areas in one go.
import type { BoardToken, FogArea } from '../api/types'
import { cellKey, footprintCells } from '../board/geometry'
import { areaCells, areasAt } from './cells'

const cellsOf = (token: Pick<BoardToken, 'size' | 'x' | 'y'>) =>
  footprintCells(token.size, token.x, token.y)

/**
 * The hidden creatures standing in an area that the token's footprint touches, the token
 * itself included while it is hidden. Empty when the token lies in no area.
 */
export function hiddenInSameAreas(
  token: Pick<BoardToken, 'size' | 'x' | 'y'>,
  tokens: readonly BoardToken[],
  areas: readonly FogArea[],
): BoardToken[] {
  const inside = new Set<string>()
  const seen = new Set<string>()
  for (const cell of cellsOf(token)) {
    for (const area of areasAt(areas, cell)) {
      if (seen.has(area.id)) continue
      seen.add(area.id)
      for (const key of areaCells(area)) inside.add(key)
    }
  }
  if (inside.size === 0) return []
  return tokens.filter(
    (other) =>
      other.kind === 'creature' &&
      other.hidden &&
      cellsOf(other).some((cell) => inside.has(cellKey(cell.x, cell.y))),
  )
}
