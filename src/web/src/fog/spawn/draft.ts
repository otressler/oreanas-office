// Placing creatures that weren't prepared (knowledge/features/creature-spawn.md): the DM
// picks a creature type, taps cells one token per tap, taps a placed token to take it away,
// and confirms with "Erscheinen lassen". Until then the tokens exist on the DM's device
// only, see-through. Pure state functions; the board page keeps the state.
import type { BoardState, BoardToken, CreatureSize, SpawnCreaturesRequest } from '../../api/types'
import type { GridPoint, MapGrid } from '../../board/geometry'
import { chooseTarget, covers } from '../../table/controls'
import { nextLabel } from '../../editor/encounter/tokens'

/** The part of a creature type spawning needs. */
export interface SpawnType {
  id: string
  name: string
  size: CreatureSize
}

export interface Placement {
  /** Local only; the server makes the token's id. */
  key: string
  type: SpawnType
  x: number
  y: number
}

export interface SpawnDraft {
  /** The type the next tap places. */
  picked: SpawnType | null
  placements: readonly Placement[]
  /** "Fertig" was tapped: the confirm bar asks. */
  finished: boolean
  /** Spawn them hidden ("Verborgen"). */
  hidden: boolean
}

export const NEW_SPAWN: SpawnDraft = {
  picked: null,
  placements: [],
  finished: false,
  hidden: false,
}

export function pickSpawnType(draft: SpawnDraft, type: SpawnType): SpawnDraft {
  return { ...draft, picked: type, finished: false }
}

/** The placed token whose footprint covers the cell, the latest first. */
function placedAt(draft: SpawnDraft, cell: GridPoint): Placement | undefined {
  return [...draft.placements].reverse().find((p) => covers(p.type.size, p, cell))
}

/**
 * A tap on the map while placing: a placed token under the tap is taken away; else the
 * picked type is placed on the tapped cell (its footprint's top-left, or the nearest
 * position that fits). Spawned tokens may stand on other tokens (question 35), so only
 * the map's walkable cells count.
 */
export function tapSpawn(
  draft: SpawnDraft,
  cell: GridPoint,
  grid: MapGrid,
  key: string,
): SpawnDraft {
  const there = placedAt(draft, cell)
  if (there) {
    return { ...draft, placements: draft.placements.filter((p) => p.key !== there.key) }
  }
  const type = draft.picked
  if (!type) return draft
  const at = chooseTarget(grid, type.size, cell)
  if (!at) return draft
  return { ...draft, placements: [...draft.placements, { key, type, x: at.x, y: at.y }] }
}

export function finishSpawn(draft: SpawnDraft): SpawnDraft {
  return draft.placements.length === 0 ? draft : { ...draft, finished: true }
}

/** Back to placing, e.g. to add one more before confirming. */
export function resumeSpawn(draft: SpawnDraft): SpawnDraft {
  return { ...draft, finished: false }
}

export function setSpawnHidden(draft: SpawnDraft, hidden: boolean): SpawnDraft {
  return { ...draft, hidden }
}

/**
 * The tokens as the DM sees them before confirming: labelled like the server will label
 * them, or by the type's name alone in an encounter with fog (the number comes at first
 * sight). Ids start with "spawn:" so the page can tell them from the board's tokens.
 */
export function previewTokens(
  draft: SpawnDraft,
  board: Pick<BoardState, 'tokens' | 'removedTokens' | 'fog'>,
): BoardToken[] {
  const known = [...board.tokens, ...board.removedTokens].map((t) => ({
    id: t.id,
    creatureTypeId: t.creatureTypeId ?? '',
    label: t.label,
    x: t.x,
    y: t.y,
    size: t.size,
  }))
  const placed: typeof known = []
  return draft.placements.map((p) => {
    const label = board.fog ? p.type.name : nextLabel(p.type, [...known, ...placed])
    placed.push({
      id: p.key,
      creatureTypeId: p.type.id,
      label,
      x: p.x,
      y: p.y,
      size: p.type.size,
    })
    return {
      id: spawnId(p.key),
      kind: 'creature',
      characterId: null,
      creatureTypeId: p.type.id,
      ownerUserId: null,
      label,
      x: p.x,
      y: p.y,
      elevation: 0,
      size: p.type.size,
      colorIndex: null,
      version: 0,
      imageUrl: null,
      color: null,
      statuses: [],
      hidden: false,
    }
  })
}

const SPAWN_PREFIX = 'spawn:'

export const spawnId = (key: string) => `${SPAWN_PREFIX}${key}`
export const isSpawnId = (id: string) => id.startsWith(SPAWN_PREFIX)

/** The ids of the preview tokens, drawn see-through. */
export function spawnIds(draft: SpawnDraft): Set<string> {
  return new Set(draft.placements.map((p) => spawnId(p.key)))
}

export function toRequest(encounterId: string, draft: SpawnDraft): SpawnCreaturesRequest {
  return {
    encounterId,
    hidden: draft.hidden,
    creatures: draft.placements.map((p) => ({ creatureTypeId: p.type.id, x: p.x, y: p.y })),
  }
}

/** How many tokens of each type are placed, in the order the types were first placed. */
export function placedByType(draft: SpawnDraft): { type: SpawnType; count: number }[] {
  const counts = new Map<string, { type: SpawnType; count: number }>()
  for (const p of draft.placements) {
    const entry = counts.get(p.type.id) ?? { type: p.type, count: 0 }
    counts.set(p.type.id, { ...entry, count: entry.count + 1 })
  }
  return [...counts.values()]
}

/**
 * The types for the picker: those used in this fight first (by the creature type ids of the
 * board's tokens, removed ones included), then the rest, each by name.
 */
export function orderTypes<T extends { id: string; name: string }>(
  types: readonly T[],
  board: Pick<BoardState, 'tokens' | 'removedTokens'>,
): { used: T[]; others: T[] } {
  const usedIds = new Set(
    [...board.tokens, ...board.removedTokens].map((t) => t.creatureTypeId).filter(Boolean),
  )
  const byName = new Intl.Collator('de-DE', { numeric: true }).compare
  const sort = (list: T[]) => list.sort((a, b) => byName(a.name, b.name))
  return {
    used: sort(types.filter((t) => usedIds.has(t.id))),
    others: sort(types.filter((t) => !usedIds.has(t.id))),
  }
}
