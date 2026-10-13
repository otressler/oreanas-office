// Phone controls for moving tokens (knowledge/features/playable-map.md, "Phone
// controls"): tap a token to select it, tap a cell to see it there as a preview, tap
// the preview again to confirm. While a token is selected, every other tap picks a
// target, even on another token. Pure functions; the fight page keeps the state and
// sends the confirmed move. Who may move what follows knowledge/domain/token.md, where
// a token may stand follows knowledge/decisions/realtime-sync.md: the whole footprint
// inside the map on walkable cells (a bridge counts), overlapping tokens allowed.
// No distance, path or reach (dropped from the proof of concept).
import type { BoardState, BoardToken, CreatureSize } from '../api/types'
import { footprint, footprintCells, type GridPoint, type MapGrid } from '../board/geometry'

export type Controls =
  | { mode: 'idle' }
  | { mode: 'selected'; tokenId: string }
  /** `target` is the top-left cell of the token's footprint at the preview. */
  | { mode: 'preview'; tokenId: string; target: GridPoint }

export const IDLE: Controls = { mode: 'idle' }

/** A confirmed move: the token's new top-left cell. */
export interface MoveIntent {
  tokenId: string
  x: number
  y: number
}

/** A tap on the board: the cell, and the token the board found on it (topmost, selected first). */
export interface Tap {
  cell: GridPoint
  token?: BoardToken
}

export interface TapContext {
  tokens: readonly BoardToken[]
  grid: MapGrid
  canMove: (token: BoardToken) => boolean
  /** Moving is on: the table is connected and the fight running. */
  enabled: boolean
}

export interface TapResult {
  controls: Controls
  /** The controls had nothing to do with the tap: the board shows its info box. */
  info?: boolean
  /** A short hint to show: the target doesn't fit, or moving is off right now. */
  hint?: 'invalidTarget' | 'movingOff'
  /** The person confirmed the preview. */
  confirm?: MoveIntent
}

/** The session DM moves any token; everyone else only their own characters. */
export function canMoveToken(
  token: Pick<BoardToken, 'kind' | 'ownerUserId'>,
  board: Pick<BoardState, 'isSessionDm'>,
  userId: string,
): boolean {
  if (board.isSessionDm) return true
  return token.kind === 'character' && token.ownerUserId === userId
}

/** Whether a token of this size may stand with its top-left corner on the cell. */
export function isValidTarget(grid: MapGrid, size: CreatureSize, x: number, y: number): boolean {
  return footprintCells(size, x, y).every((cell) => grid.walkable(cell.x, cell.y))
}

/**
 * The footprint a tap means for a token of this size: the tapped cell as its top-left
 * cell; if that doesn't fit, the other positions whose footprint covers the tapped
 * cell, in reading order. Null when none fits.
 */
export function chooseTarget(grid: MapGrid, size: CreatureSize, cell: GridPoint): GridPoint | null {
  if (isValidTarget(grid, size, cell.x, cell.y)) return { x: cell.x, y: cell.y }
  const n = footprint(size)
  for (let y = cell.y - n + 1; y <= cell.y; y++) {
    for (let x = cell.x - n + 1; x <= cell.x; x++) {
      if (x === cell.x && y === cell.y) continue
      if (isValidTarget(grid, size, x, y)) return { x, y }
    }
  }
  return null
}

/** Whether the cell lies under the token's footprint with its top-left corner at `at`. */
function covers(size: CreatureSize, at: GridPoint, cell: GridPoint): boolean {
  const n = footprint(size)
  return cell.x >= at.x && cell.y >= at.y && cell.x < at.x + n && cell.y < at.y + n
}

/**
 * The controls as they apply now: back to idle when moving is off or the selected
 * token is gone (the fight reloaded without it).
 */
export function currentControls(
  controls: Controls,
  tokens: readonly BoardToken[],
  enabled: boolean,
): Controls {
  if (controls.mode === 'idle') return controls
  if (!enabled || !tokens.some((token) => token.id === controls.tokenId)) return IDLE
  return controls
}

/** What a tap on the board does. */
export function tapBoard(controls: Controls, tap: Tap, context: TapContext): TapResult {
  const { tokens, grid, canMove, enabled } = context
  const current = currentControls(controls, tokens, enabled)
  const movable = tap.token && canMove(tap.token) ? tap.token : undefined

  if (!enabled) {
    return movable
      ? { controls: IDLE, info: true, hint: 'movingOff' }
      : { controls: IDLE, info: true }
  }

  if (current.mode === 'idle') {
    return movable
      ? { controls: { mode: 'selected', tokenId: movable.id } }
      : { controls: current, info: true }
  }

  const selected = tokens.find((token) => token.id === current.tokenId)!
  // The preview is drawn on top of everything, so a tap on it confirms.
  if (current.mode === 'preview' && covers(selected.size, current.target, tap.cell)) {
    return {
      controls: IDLE,
      confirm: { tokenId: selected.id, x: current.target.x, y: current.target.y },
    }
  }
  if (tap.token?.id === selected.id) return { controls: IDLE }

  // Any other cell is a target, also one with another token on it: tokens may overlap,
  // and the session DM, who may move every token, must be able to stack them too. To
  // take another token, let go of this one first.
  const target = chooseTarget(grid, selected.size, tap.cell)
  if (!target) return { controls: current, hint: 'invalidTarget' }
  return { controls: { mode: 'preview', tokenId: selected.id, target } }
}

/** The "Hierhin" button: confirms the preview. */
export function confirmPreview(controls: Controls): MoveIntent | null {
  return controls.mode === 'preview'
    ? { tokenId: controls.tokenId, x: controls.target.x, y: controls.target.y }
    : null
}
