// The preview's data: the map as a board state the stage 3 renderer understands, and
// where a test token may stand (the placement rule of knowledge/domain/encounter.md,
// with no other tokens on the map).
import type { BoardState, BoardToken, CreatureSize } from '../../api/types'
import { cellKey, fitsAt, placementElevation, type MapGrid } from '../../board/geometry'
import type { EditorMap } from '../model'

export const PREVIEW_ID = 'preview'
export const TEST_TOKEN_ID = 'test-token'

const NOTHING_TAKEN: ReadonlySet<string> = new Set()

/** A test token at a top-left cell. */
export interface TestToken {
  x: number
  y: number
  size: CreatureSize
}

/** Whether a token of this size may stand with its top-left corner at the cell. */
export function canStand(grid: MapGrid, size: CreatureSize, x: number, y: number): boolean {
  return fitsAt(grid, NOTHING_TAKEN, size, x, y)
}

/** Every cell a token of this size may have its top-left corner on, as cellKey strings. */
export function standCells(grid: MapGrid, size: CreatureSize): Set<string> {
  const cells = new Set<string>()
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) if (canStand(grid, size, x, y)) cells.add(cellKey(x, y))
  return cells
}

/** The map as the board shows it to players, with the test token if one stands on it. */
export function previewBoard(
  doc: EditorMap,
  grid: MapGrid,
  label: string,
  token: TestToken | null,
): BoardState {
  const tokens: BoardToken[] = token
    ? [
        {
          id: TEST_TOKEN_ID,
          kind: 'character',
          characterId: null,
          creatureTypeId: null,
          ownerUserId: null,
          label,
          x: token.x,
          y: token.y,
          elevation: placementElevation(grid, token.size, token.x, token.y),
          size: token.size,
          colorIndex: 0,
          version: 0,
        },
      ]
    : []
  return {
    encounterId: PREVIEW_ID,
    campaignId: '',
    sessionId: null,
    name: doc.name,
    status: 'draft',
    map: {
      id: PREVIEW_ID,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      layout: doc.layout,
      backgroundUrl: null,
    },
    tokens,
    isSessionDm: false,
    undoableMove: null,
  }
}
