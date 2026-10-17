// What the token card shows (knowledge/features/token-card.md), worked out from the page's
// card state and the board as shown: the token the card is about, every token on the
// tapped cell for a stack (the ones the person may move first), or a cell's terrain. Pure
// functions; the fight page keeps the state.
import type { BoardState, BoardToken } from '../api/types'
import { tokensAt, type GridPoint } from '../board/geometry'
import { cellInfo, type BoardInfo } from '../board/info'
import type { MapScene } from '../board/scene'
import { formatElevation } from '../lib/units'
import { personName } from '../statuses/rules'
import { de } from '../text/de'
import { covers, type Card } from '../table/controls'

export type ShownCard =
  | {
      kind: 'token'
      /** The token the card is about: the one the tap acted on, or a picked row. */
      token: BoardToken
      /** The cell the stack is read from. */
      cell: GridPoint
      /** Every token on the cell, those the person may move first; one row means no stack. */
      rows: BoardToken[]
    }
  | { kind: 'cell'; cell: GridPoint; info: BoardInfo }

/**
 * The card as it shows now: closed when its token left the board (taken off, or a reload
 * without it) or its cell has nothing to say. A token that moved away from the tapped cell
 * takes the card along to where it stands now.
 */
export function showCard(
  card: Card | null,
  tokens: readonly BoardToken[],
  scene: MapScene,
  canMove: (token: BoardToken) => boolean,
): ShownCard | null {
  if (!card) return null
  if (card.kind === 'cell') {
    const info = cellInfo(scene, card.cell.x, card.cell.y)
    return info ? { kind: 'cell', cell: card.cell, info } : null
  }
  const token = tokens.find((candidate) => candidate.id === card.tokenId)
  if (!token) return null
  const cell = covers(token.size, token, card.cell) ? card.cell : { x: token.x, y: token.y }
  return { kind: 'token', token, cell, rows: stackRows(tokens, cell, canMove) }
}

/** The tokens on a cell for the card's rows: top first as drawn, the person's movable ones before the rest. */
export function stackRows(
  tokens: readonly BoardToken[],
  cell: GridPoint,
  canMove: (token: BoardToken) => boolean,
): BoardToken[] {
  const here = tokensAt(tokens, cell)
  return [...here.filter(canMove), ...here.filter((token) => !canMove(token))]
}

/** The line under a token's label: whose character it is, or that it is a creature. */
export function tokenKind(
  token: Pick<BoardToken, 'kind' | 'ownerUserId'>,
  people: BoardState['people'],
): string {
  if (token.kind === 'creature') return de.tokenCard.creature
  return de.tokenCard.characterOf(personName(people, token.ownerUserId) ?? de.statuses.someone)
}

/** Size and elevation, e.g. "Mittelgroß · Höhe 1,5 m". */
export function tokenMeasures(token: Pick<BoardToken, 'size' | 'elevation'>): string {
  return `${de.sizes[token.size]} · ${de.board.elevation(formatElevation(token.elevation))}`
}
