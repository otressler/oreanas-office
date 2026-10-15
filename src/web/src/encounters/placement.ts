// The setup screen's placement logic (knowledge/domain/encounter.md, "Starting"):
// characters become temporary tokens on a copy of the board until the fight starts.
// The placement rule itself lives in board/geometry.ts, shared with the server's.
import type { BoardState, BoardToken, Character, LayoutEntrance } from '../api/types'
import {
  cellKey,
  fitsAt,
  occupiedCells,
  placementElevation,
  type GridPoint,
  type MapGrid,
} from '../board/geometry'

/** Where each ticked character stands; null until placed. Insertion order is tick order. */
export type Positions = ReadonlyMap<string, GridPoint | null>

/** The temporary token id of a character on the setup screen. */
export function setupTokenId(characterId: string): string {
  return `setup-${characterId}`
}

/**
 * The board with the placed characters as extra tokens, in the ring colours the
 * board will give them once the fight starts.
 */
export function withPlacedCharacters(
  board: BoardState,
  grid: MapGrid,
  characters: readonly Character[],
  positions: Positions,
): BoardState {
  const placed: BoardToken[] = []
  for (const character of characters) {
    const position = positions.get(character.id)
    if (!position) continue
    placed.push({
      id: setupTokenId(character.id),
      kind: 'character',
      characterId: character.id,
      creatureTypeId: null,
      ownerUserId: character.ownerUserId,
      label: character.name,
      x: position.x,
      y: position.y,
      elevation: placementElevation(grid, character.size, position.x, position.y),
      size: character.size,
      colorIndex: character.colorIndex,
      version: 0,
      imageUrl: character.portraitUrl,
    })
  }
  return { ...board, tokens: [...board.tokens, ...placed] }
}

/** Every cell where the character's top-left corner can go, as cellKey strings. */
export function freeCells(
  grid: MapGrid,
  tokens: readonly BoardToken[],
  character: Pick<Character, 'id' | 'size'>,
): Set<string> {
  const cells = new Set<string>()
  const taken = occupiedCells(tokens, setupTokenId(character.id))
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (fitsAt(grid, taken, character.size, x, y)) cells.add(cellKey(x, y))
    }
  }
  return cells
}

/**
 * Places each character on the nearest free cell to the map's entrances (or from
 * the top-left without any), in order. Null for a character that doesn't fit anywhere.
 */
export function autoPlace(
  grid: MapGrid,
  tokens: readonly BoardToken[],
  entrances: readonly LayoutEntrance[],
  characters: readonly Pick<Character, 'id' | 'size'>[],
): Map<string, GridPoint | null> {
  const doors = entrances.flatMap((entrance) => entrance.cells.map(([x = 0, y = 0]) => ({ x, y })))
  const distance = (cell: GridPoint) =>
    doors.length === 0
      ? 0
      : Math.min(...doors.map((door) => (door.x - cell.x) ** 2 + (door.y - cell.y) ** 2))

  const candidates: (GridPoint & { distance: number })[] = []
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) candidates.push({ x, y, distance: distance({ x, y }) })
  }
  // Stable sort: equal distances keep reading order.
  candidates.sort((a, b) => a.distance - b.distance)

  const placed: Pick<BoardToken, 'id' | 'x' | 'y' | 'size'>[] = [...tokens]
  const result = new Map<string, GridPoint | null>()
  for (const character of characters) {
    const id = setupTokenId(character.id)
    const taken = occupiedCells(placed, id)
    const spot = candidates.find((cell) => fitsAt(grid, taken, character.size, cell.x, cell.y))
    result.set(character.id, spot ? { x: spot.x, y: spot.y } : null)
    if (spot) placed.push({ id, x: spot.x, y: spot.y, size: character.size })
  }
  return result
}
