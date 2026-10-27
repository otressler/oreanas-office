// Which token position is current (knowledge/decisions/realtime-sync.md). Every move
// and undo raises the token's version, so a device keeps whichever position has the
// higher version: a TokenMoved event that arrives after the board, or one that
// arrived before a board reload that was already on its way. On top of that, the
// device's own move waits for the server as a pending position (optimistic UI).
import type {
  BoardState,
  BoardToken,
  TokenDeadChangedEvent,
  TokenHitPointsChangedEvent,
  TokenMovedEvent,
  TokenRemovedEvent,
  TokenRestoredEvent,
  TokenStatusesChangedEvent,
} from '../api/types'

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

// ---- Statuses and removed tokens (stage 9) -----------------------------------------------
// Status changes carry a token's whole list, so the newest event simply replaces it. A
// board reload brings the saved state, which wins anyway once it lands.

/** The definitions with any new or changed ones from `added`, by id. */
function withDefinitions(
  definitions: BoardState['statuses'],
  added: BoardState['statuses'],
): BoardState['statuses'] {
  if (added.length === 0) return definitions
  const byId = new Map(definitions.map((definition) => [definition.id, definition]))
  for (const definition of added) byId.set(definition.id, definition)
  return [...byId.values()]
}

/** The board with a token's new status list, on the board or among the removed tokens. */
export function applyStatuses(board: BoardState, change: TokenStatusesChangedEvent): BoardState {
  if (change.encounterId !== board.encounterId) return board
  const update = (tokens: BoardToken[]) =>
    tokens.map((token) =>
      token.id === change.tokenId ? { ...token, statuses: change.statuses } : token,
    )
  return {
    ...board,
    tokens: update(board.tokens),
    removedTokens: update(board.removedTokens),
    statuses: withDefinitions(board.statuses, change.definitions),
  }
}

/**
 * The board without the removed token. The session DM's board keeps it at the top of
 * `removedTokens`, for "Vom Feld genommen"; everyone else's drops it.
 */
export function applyRemoved(board: BoardState, removed: TokenRemovedEvent): BoardState {
  if (removed.encounterId !== board.encounterId) return board
  const token = board.tokens.find((candidate) => candidate.id === removed.tokenId)
  if (!token) return board
  return {
    ...board,
    tokens: board.tokens.filter((candidate) => candidate.id !== removed.tokenId),
    removedTokens: board.isSessionDm
      ? [
          { ...token, removedAt: removed.removedAt },
          ...board.removedTokens.filter((candidate) => candidate.id !== removed.tokenId),
        ]
      : board.removedTokens,
  }
}

/** The board with the token back on it and out of `removedTokens`. */
export function applyRestored(board: BoardState, restored: TokenRestoredEvent): BoardState {
  if (restored.encounterId !== board.encounterId) return board
  const token = { ...restored.token, removedAt: null }
  return {
    ...board,
    tokens: [...board.tokens.filter((candidate) => candidate.id !== token.id), token],
    removedTokens: board.removedTokens.filter((candidate) => candidate.id !== token.id),
    statuses: withDefinitions(board.statuses, restored.definitions),
  }
}

// ---- Hit points and the dead mark (knowledge/features/hit-points.md) -----------------------
// Each event carries the whole value, so the newest one replaces it; a board reload brings
// the saved state. Removed tokens keep theirs for when they come back.

/** The board with one token, on it or among the removed ones, changed by `change`. */
function updateToken(
  board: BoardState,
  tokenId: string,
  change: (token: BoardToken) => BoardToken,
): BoardState {
  const update = (tokens: BoardToken[]) =>
    tokens.some((token) => token.id === tokenId)
      ? tokens.map((token) => (token.id === tokenId ? change(token) : token))
      : tokens
  const tokens = update(board.tokens)
  const removedTokens = update(board.removedTokens)
  return tokens === board.tokens && removedTokens === board.removedTokens
    ? board
    : { ...board, tokens, removedTokens }
}

/** The board with a creature's newly noted hit points. */
export function applyHitPoints(board: BoardState, changed: TokenHitPointsChangedEvent): BoardState {
  if (changed.encounterId !== board.encounterId) return board
  return updateToken(board, changed.tokenId, (token) => ({
    ...token,
    hitPoints: changed.hitPoints,
    maxHitPoints: changed.maxHitPoints,
  }))
}

/** The board with a creature marked dead or alive again. */
export function applyDead(board: BoardState, changed: TokenDeadChangedEvent): BoardState {
  if (changed.encounterId !== board.encounterId) return board
  return updateToken(board, changed.tokenId, (token) => ({ ...token, dead: changed.dead }))
}
