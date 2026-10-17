// Fog and hidden creatures at the table (stage 10, knowledge/features/fog-of-war.md): how the
// cached board takes FogChanged, TokenRevealed, TokenHidden and TokensAdded, next to
// merge.ts. The server filters per connection: players get the layout of newly revealed
// cells and the creatures that became visible, or the cells hidden again and the ids of
// creatures that went; the session DM gets the plain changes. Every fog change raises the
// fog's version, and a device keeps the fog with the higher one.
import type {
  BoardCell,
  BoardState,
  BoardToken,
  FogChangedEvent,
  MapLayout,
  TokenHiddenEvent,
  TokenRevealedEvent,
  TokensAddedEvent,
} from '../api/types'
import { cellKey, footprintCells } from '../board/geometry'
import { boardCells, hiddenOfView } from '../fog/cells'

/** The highest-version fog this device has seen from events; an older reload loses to it. */
export interface KnownFog {
  version: number
  hiddenCells: BoardCell[]
}

/** The layout with the newly revealed cells, features and entrance cells added (or replaced by id). */
export function mergeLayout(layout: MapLayout, added: MapLayout): MapLayout {
  const cells = new Map(layout.cells.map((cell) => [cellKey(cell.x, cell.y), cell]))
  for (const cell of added.cells) cells.set(cellKey(cell.x, cell.y), cell)
  const features = new Map(layout.features.map((feature) => [feature.id, feature]))
  for (const feature of added.features) features.set(feature.id, feature)
  const entrances = new Map(layout.entrances.map((entrance) => [entrance.id, entrance]))
  for (const entrance of added.entrances) {
    const before = entrances.get(entrance.id)
    const known = new Set((before?.cells ?? []).map(([x = 0, y = 0]) => cellKey(x, y)))
    const more = entrance.cells.filter(([x = 0, y = 0]) => !known.has(cellKey(x, y)))
    entrances.set(entrance.id, { ...entrance, cells: [...(before?.cells ?? []), ...more] })
  }
  return {
    ...layout,
    cells: [...cells.values()],
    features: [...features.values()],
    entrances: [...entrances.values()],
  }
}

/**
 * The layout without the cells that are hidden now, so a player's device forgets what the
 * DM covered again. Cells under characters stay (they are always shown), a feature stays
 * while one of its cells is shown, an entrance while any of its cells is.
 */
export function pruneLayout(
  layout: MapLayout,
  hidden: ReadonlySet<string>,
  tokens: readonly Pick<BoardToken, 'kind' | 'size' | 'x' | 'y'>[],
): MapLayout {
  const shown = new Set<string>()
  for (const token of tokens) {
    if (token.kind !== 'character') continue
    for (const cell of footprintCells(token.size, token.x, token.y))
      shown.add(cellKey(cell.x, cell.y))
  }
  const revealed = (x: number, y: number) => !hidden.has(cellKey(x, y)) || shown.has(cellKey(x, y))
  return {
    ...layout,
    cells: layout.cells.filter((cell) => revealed(cell.x, cell.y)),
    features: layout.features.filter((feature) => {
      for (let y = feature.y; y < feature.y + feature.h; y++)
        for (let x = feature.x; x < feature.x + feature.w; x++) if (revealed(x, y)) return true
      return false
    }),
    entrances: layout.entrances
      .map((entrance) => ({
        ...entrance,
        cells: entrance.cells.filter(([x = 0, y = 0]) => revealed(x, y)),
      }))
      .filter((entrance) => entrance.cells.length > 0),
  }
}

/** The tokens with `added` replacing the ones of the same id in place, new ones at the end. */
function withTokens(tokens: BoardToken[], added: readonly BoardToken[]): BoardToken[] {
  if (added.length === 0) return tokens
  const byId = new Map(added.map((token) => [token.id, token]))
  const known = new Set(tokens.map((token) => token.id))
  return [
    ...tokens.map((token) => byId.get(token.id) ?? token),
    ...added.filter((token) => !known.has(token.id)),
  ]
}

/**
 * The board after a fog change. Ignored when the fog already has that version or a newer
 * one (a reload that was on its way, or an event that arrived twice).
 */
export function applyFogChanged(board: BoardState, event: FogChangedEvent): BoardState {
  if (event.encounterId !== board.encounterId) return board
  if (board.fog && event.version <= board.fog.version) return board
  const hidden = hiddenOfView(board.fog)
  for (const cell of event.cells) {
    const key = cellKey(cell.x, cell.y)
    if (event.reveal) hidden.delete(key)
    else hidden.add(key)
  }
  let map = board.map
  // The session DM's layout is whole; only a player's follows the fog.
  if (board.viewer === 'player') {
    if (event.reveal && event.revealedLayout) {
      map = { ...map, layout: mergeLayout(map.layout, event.revealedLayout) }
    } else if (!event.reveal) {
      map = { ...map, layout: pruneLayout(map.layout, hidden, board.tokens) }
    }
  }
  const gone = new Set(event.disappeared)
  const numbered = new Map(event.numbered.map((number) => [number.tokenId, number.label]))
  const tokens = withTokens(
    board.tokens
      .filter((token) => !gone.has(token.id))
      .map((token) => {
        const label = numbered.get(token.id)
        return label === undefined ? token : { ...token, label }
      }),
    event.appeared,
  )
  return {
    ...board,
    map,
    tokens,
    fog: {
      version: event.version,
      hiddenCells: boardCells(hidden),
      areas: board.fog?.areas ?? [],
    },
  }
}

/** A creature became visible (players: the whole token), or is no longer hidden (DM). */
export function applyRevealed(board: BoardState, event: TokenRevealedEvent): BoardState {
  if (event.encounterId !== board.encounterId) return board
  const before = board.tokens.find((token) => token.id === event.token.id)
  // A move that raced the reveal keeps its newer position.
  const token = before && before.version > event.token.version ? before : event.token
  return { ...board, tokens: withTokens(board.tokens, [{ ...token, hidden: false }]) }
}

/**
 * A creature was hidden again. The session DM keeps it, see-through; a player's device
 * gets only its id and drops it.
 */
export function applyTokenHidden(board: BoardState, event: TokenHiddenEvent): BoardState {
  if (event.encounterId !== board.encounterId) return board
  if (!board.tokens.some((token) => token.id === event.tokenId)) return board
  if (board.viewer === 'dm') {
    return {
      ...board,
      tokens: board.tokens.map((token) =>
        token.id === event.tokenId ? { ...token, hidden: true } : token,
      ),
    }
  }
  return { ...board, tokens: board.tokens.filter((token) => token.id !== event.tokenId) }
}

/** Spawned creatures this device may see. */
export function applyAdded(board: BoardState, event: TokensAddedEvent): BoardState {
  if (event.encounterId !== board.encounterId) return board
  return { ...board, tokens: withTokens(board.tokens, event.tokens) }
}

/** The (reloaded) board with the known fog when that has the higher version. */
export function mergeFog(board: BoardState, known: KnownFog | null): BoardState {
  if (!known || (board.fog && board.fog.version >= known.version)) return board
  return {
    ...board,
    fog: { version: known.version, hiddenCells: known.hiddenCells, areas: board.fog?.areas ?? [] },
  }
}
