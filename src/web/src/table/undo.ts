// When the "Rückgängig" button shows (knowledge/decisions/realtime-sync.md, "Undo"):
// a person undoes only their own last move, and only while it is still that token's
// latest move. The device knows the move from the board (`undoableMove`, after a
// load) or from its own last confirmed move, whichever came later.
import type { BoardToken, UndoableMove } from '../api/types'

/**
 * The move the device would undo. `local` is what the device set itself: its last
 * confirmed move, or null after an undo or a failed one; undefined until then (or
 * since a reload brought a new `undoableMove`).
 */
export function undoCandidate(
  local: UndoableMove | null | undefined,
  fromBoard: UndoableMove | null,
): UndoableMove | null {
  return local === undefined ? fromBoard : local
}

/** Shown only while the token's version is still the move's and the table is connected. */
export function isUndoVisible(
  move: UndoableMove | null,
  tokens: readonly Pick<BoardToken, 'id' | 'version'>[],
  connected: boolean,
): boolean {
  if (!move || !connected) return false
  return tokens.some((token) => token.id === move.tokenId && token.version === move.version)
}
