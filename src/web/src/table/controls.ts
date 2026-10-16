// Phone controls for moving tokens and the token card (knowledge/features/playable-map.md,
// "Phone controls"; knowledge/features/token-card.md, "Taps on the board"). One sentence
// for a single tap: a tap on a token opens its card, and if the person may move the
// token, the same tap selects it. Then a tap on a cell shows the token there as a
// preview, and tapping the preview again confirms. While a token is selected, every other
// tap picks a target, even on another token. Tokens may stack: a tap selects the person's
// own topmost token there, and tapping the selected token again lets it go (the card's
// rows pick another token of the stack). A tap on an empty cell closes an open card, or
// with none open shows the cell's terrain and elevation in its place. Pure functions; the
// fight page keeps the state and sends the confirmed move. Who may move what follows
// knowledge/domain/token.md, where a token may stand follows
// knowledge/decisions/realtime-sync.md: the whole footprint inside the map on walkable
// cells (a bridge counts), overlapping tokens allowed. No distance, path or reach
// (dropped from the proof of concept).
import type { BoardState, BoardToken, CreatureSize } from '../api/types'
import {
  footprint,
  footprintCells,
  tokensAt,
  type GridPoint,
  type MapGrid,
} from '../board/geometry'

export type Controls =
  | { mode: 'idle' }
  | { mode: 'selected'; tokenId: string }
  /** `target` is the top-left cell of the token's footprint at the preview. */
  | { mode: 'preview'; tokenId: string; target: GridPoint }

export const IDLE: Controls = { mode: 'idle' }

/**
 * What the token card shows (knowledge/features/token-card.md): a token, with the cell
 * that was tapped (a stack lists every token there), or a cell's terrain and elevation.
 */
export type Card =
  { kind: 'token'; tokenId: string; cell: GridPoint } | { kind: 'cell'; cell: GridPoint }

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
  /** What the card shows before the tap; nothing when it is closed. */
  card?: Card | null
}

export interface TapResult {
  controls: Controls
  /** What the card shows after the tap; null closes it. */
  card: Card | null
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

/**
 * The order to draw tokens in for this person: their own characters on top of everything
 * else, so a token put on theirs never hides it. Otherwise the order stays as it is.
 */
export function ownTokensOnTop<T extends Pick<BoardToken, 'kind' | 'ownerUserId'>>(
  tokens: readonly T[],
  userId: string,
): T[] {
  const own = (token: T) => token.kind === 'character' && token.ownerUserId === userId
  return [...tokens.filter((token) => !own(token)), ...tokens.filter(own)]
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
export function covers(size: CreatureSize, at: GridPoint, cell: GridPoint): boolean {
  const n = footprint(size)
  return cell.x >= at.x && cell.y >= at.y && cell.x < at.x + n && cell.y < at.y + n
}

/**
 * The controls as they apply now: back to idle when moving is off or the selected
 * token is gone (the fight reloaded without it, or it was taken off the board).
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
  const { tokens, grid, canMove, enabled, card = null } = context
  const current = currentControls(controls, tokens, enabled)

  if (current.mode === 'idle') {
    if (!tap.token) return { controls: current, card: cellCard(card, tap.cell) }
    // The person's tokens on the tapped cell, top first as drawn without a selection: in
    // a stack, theirs may lie under a creature or someone else's character. The card
    // opens on the token the tap acts on: their own topmost, else the one on top.
    const own = tokensAt(tokens, tap.cell).find(canMove)
    const shown: Card = { kind: 'token', tokenId: (own ?? tap.token).id, cell: tap.cell }
    if (!own) return { controls: current, card: shown }
    if (!enabled) return { controls: current, card: shown, hint: 'movingOff' }
    return { controls: { mode: 'selected', tokenId: own.id }, card: shown }
  }

  const selected = tokens.find((token) => token.id === current.tokenId)!
  // The preview is drawn on top of everything, so a tap on it confirms.
  if (current.mode === 'preview' && covers(selected.size, current.target, tap.cell)) {
    return {
      controls: IDLE,
      card,
      confirm: { tokenId: selected.id, x: current.target.x, y: current.target.y },
    }
  }
  // The selected token again: let go. Its card stays.
  if (covers(selected.size, selected, tap.cell)) {
    return { controls: IDLE, card: { kind: 'token', tokenId: selected.id, cell: tap.cell } }
  }

  // Any other cell is a target, also one with another token on it: tokens may overlap,
  // and the session DM, who may move every token, must be able to stack them too. To
  // take another token, let go of this one first, or pick it in the card's stack.
  const target = chooseTarget(grid, selected.size, tap.cell)
  if (!target) return { controls: current, card, hint: 'invalidTarget' }
  return { controls: { mode: 'preview', tokenId: selected.id, target }, card }
}

/**
 * A tap on an empty cell with nothing selected: an open token card closes; otherwise the
 * cell's terrain shows, and a second tap on the same cell closes it again.
 */
function cellCard(card: Card | null, cell: GridPoint): Card | null {
  if (card?.kind === 'token') return null
  if (card?.kind === 'cell' && card.cell.x === cell.x && card.cell.y === cell.y) return null
  return { kind: 'cell', cell: { x: cell.x, y: cell.y } }
}

/**
 * A row of the card's stack picked: a token the person may move becomes the selected one,
 * as if tapped on the board (a preview of another token goes); any other token only shows
 * its details in the card, and the selection stays.
 */
export function pickRow(
  controls: Controls,
  token: BoardToken,
  cell: GridPoint,
  context: Pick<TapContext, 'canMove' | 'enabled'>,
): { controls: Controls; card: Card } {
  const card: Card = { kind: 'token', tokenId: token.id, cell }
  if (!context.enabled || !context.canMove(token)) return { controls, card }
  if (controls.mode !== 'idle' && controls.tokenId === token.id) return { controls, card }
  return { controls: { mode: 'selected', tokenId: token.id }, card }
}

/** The "Hierhin" button: confirms the preview. */
export function confirmPreview(controls: Controls): MoveIntent | null {
  return controls.mode === 'preview'
    ? { tokenId: controls.tokenId, x: controls.target.x, y: controls.target.y }
    : null
}
