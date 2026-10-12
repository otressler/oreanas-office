// What the board's own info box says about a tapped cell or token
// (knowledge/features/playable-map.md: "Show the elevation of a cell and of each token on tap").
import type { BoardToken } from '../api/types'
import { formatElevation } from '../lib/units'
import { de } from '../text/de'
import type { MapScene } from './scene'

export interface BoardInfo {
  title: string
  details: string[]
}

/**
 * A cell: the feature on it (or its terrain), the entrance it belongs to and its
 * elevation. Null for void without a feature, which isn't part of the map.
 */
export function cellInfo(scene: MapScene, x: number, y: number): BoardInfo | null {
  const { grid } = scene
  if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) return null
  const terrain = grid.terrain(x, y)
  const feature = grid.featureAt(x, y)
  if (!feature && terrain === 'void') return null

  const details: string[] = []
  // Under a feature the terrain is the second line; a bridge's void isn't worth saying.
  if (feature && terrain !== 'void') details.push(de.board.terrain[terrain])
  const entrance = scene.entranceAt(x, y)
  if (entrance)
    details.push(de.board.entrance(de.board.entranceKinds[entrance.kind], entrance.label))
  details.push(de.board.elevation(formatElevation(grid.elevation(x, y))))

  return {
    title: feature ? feature.label || feature.kind : de.board.terrain[terrain],
    details,
  }
}

/** A token: its label, its size and its elevation. */
export function tokenInfo(token: Pick<BoardToken, 'label' | 'size' | 'elevation'>): BoardInfo {
  return {
    title: token.label,
    details: [de.sizes[token.size], de.board.elevation(formatElevation(token.elevation))],
  }
}
