// What players see of a board, worked out on the device only for the session DM's
// "Spieleransicht" (knowledge/features/fog-of-war.md): the same rule the server applies
// before anything leaves it (src/Server/Table/TableVisibility.cs). A creature is visible
// when it isn't hidden and at least one cell of its footprint is revealed; characters are
// always visible. Nothing here is sent anywhere.
import type { BoardToken } from '../api/types'
import { cellKey, footprintCells } from '../board/geometry'
import type { CellSet } from './cells'

/** Whether players see this token, given the hidden cells. */
export function visibleToPlayers(
  token: Pick<BoardToken, 'kind' | 'hidden' | 'size' | 'x' | 'y'>,
  hidden: CellSet,
): boolean {
  if (token.kind === 'character') return true
  if (token.hidden) return false
  if (hidden.size === 0) return true
  return footprintCells(token.size, token.x, token.y).some(
    (cell) => !hidden.has(cellKey(cell.x, cell.y)),
  )
}

/** The tokens players see; the same array when all of them are visible. */
export function tokensForPlayers<T extends Parameters<typeof visibleToPlayers>[0]>(
  tokens: readonly T[],
  hidden: CellSet,
): readonly T[] {
  const visible = tokens.filter((token) => visibleToPlayers(token, hidden))
  return visible.length === tokens.length ? tokens : visible
}
