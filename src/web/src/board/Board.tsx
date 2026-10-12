// The battle map on screen (knowledge/features/playable-map.md): the plain layout
// rendering, the grid, features, entrances and tokens, with pinch-zoom, pan and
// fit-to-screen. Owned by the board renderer lane; this is the contract other
// screens build against.
import type { BoardState, BoardToken } from '../api/types'
import type { GridPoint } from './geometry'

export interface BoardProps {
  board: BoardState
  /**
   * A tap on a cell: a short touch or click, never the end of a pan or pinch.
   * Without this handler the board shows the cell's terrain and elevation itself.
   */
  onCellTap?: (cell: GridPoint) => void
  /** A tap on a token. Without this handler the board shows the token's details itself. */
  onTokenTap?: (token: BoardToken) => void
  /** Cells shaded as targets, as cellKey(x, y) strings: free cells on the setup screen, reach in stage 4. */
  highlight?: ReadonlySet<string>
  /** A token drawn as selected. */
  selectedTokenId?: string | null
  /** The board fills its container; the page gives it a size. */
  className?: string
}

export function Board({ board, className }: BoardProps) {
  return (
    <div className={className} data-testid="board">
      {board.name}
    </div>
  )
}
