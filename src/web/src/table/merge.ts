// Which token position is current (knowledge/decisions/realtime-sync.md). Every move
// and undo raises the token's version, so a device keeps whichever position has the
// higher version: a TokenMoved event that arrives after the board, or one that
// arrived before a board reload that was already on its way. On top of that, the
// device's own move waits for the server as a pending position (optimistic UI).
import type { BoardState, BoardToken, TokenMovedEvent } from '../api/types'

/** Where a token stands, at which version. */
export interface TokenPosition {
  x: number
  y: number
  elevation: number
  version: number
}

/** The highest-version position this device has seen per token, from events and results. */
export type KnownPositions = ReadonlyMap<string, TokenPosition>

/** The device's own move while the server hasn't answered yet, per token. */
export type PendingMoves = ReadonlyMap<string, Omit<TokenPosition, 'version'>>

const positionOf = (move: TokenMovedEvent): TokenPosition => ({
  x: move.x,
  y: move.y,
  elevation: move.elevation,
  version: move.version,
})

/** The board with the move applied, or the same board when it already has that version or a newer one. */
export function applyMove(board: BoardState, move: TokenMovedEvent): BoardState {
  if (move.encounterId !== board.encounterId) return board
  const index = board.tokens.findIndex((token) => token.id === move.tokenId)
  const token = board.tokens[index]
  if (!token || move.version <= token.version) return board
  const tokens = [...board.tokens]
  tokens[index] = { ...token, ...positionOf(move) }
  return { ...board, tokens }
}

/** The known positions with the move, or the same map when it isn't newer. */
export function rememberMove(known: KnownPositions, move: TokenMovedEvent): KnownPositions {
  const before = known.get(move.tokenId)
  if (before && before.version >= move.version) return known
  return new Map(known).set(move.tokenId, positionOf(move))
}

/**
 * A (reloaded) board where every token whose known position has a higher version
 * keeps that position. The same board when nothing is newer.
 */
export function mergeKnown(board: BoardState, known: KnownPositions): BoardState {
  if (known.size === 0) return board
  let changed = false
  const tokens: BoardToken[] = board.tokens.map((token) => {
    const newer = known.get(token.id)
    if (!newer || newer.version <= token.version) return token
    changed = true
    return { ...token, ...newer }
  })
  return changed ? { ...board, tokens } : board
}

/** The board as the device shows it: pending own moves drawn at their targets. */
export function withPending(board: BoardState, pending: PendingMoves): BoardState {
  if (pending.size === 0) return board
  let changed = false
  const tokens = board.tokens.map((token) => {
    const target = pending.get(token.id)
    if (!target) return token
    changed = true
    return { ...token, ...target }
  })
  return changed ? { ...board, tokens } : board
}
