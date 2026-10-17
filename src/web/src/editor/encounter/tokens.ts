// The encounter editor's pure rules (knowledge/domain/encounter.md, "Placement rule";
// domain/token.md, "label"): where creatures may stand, how labels number themselves and
// when an encounter may be marked ready. Every change is a function from one
// EncounterDoc to the next, like the map editor's.
import type { BoardToken, CreatureSize, EncounterStatus } from '../../api/types'
import {
  buildGrid,
  fitsAt,
  occupiedCells,
  placementElevation,
  type GridPoint,
  type MapGrid,
} from '../../board/geometry'
import type { LocalCreatureToken, LocalEncounter } from '../../offline/model'

/** What the encounter editor changes, and what undo and redo restore. */
export interface EncounterDoc {
  name: string
  /** The editor writes draft and ready; active and ended encounters open read-only. */
  status: EncounterStatus
  archivedAt: string | null
  tokens: LocalCreatureToken[]
}

/** The server's limits for encounter names and token labels. */
export const ENCOUNTER_NAME_MAX = 80
export const LABEL_MAX = 40

/** The editable part of a stored encounter. */
export function encounterDocOf(record: LocalEncounter): EncounterDoc {
  const { name, status, archivedAt, tokens } = record
  return { name, status, archivedAt, tokens }
}

/** The part of a creature type a new token takes over. */
export interface PlaceableType {
  id: string
  name: string
  size: CreatureSize
}

// --- Labels ---------------------------------------------------------------------------

// A type name of 40 characters plus " 12" would not fit the label limit, so the number
// is appended to at most this many characters of the name.
const NAME_PART_MAX = LABEL_MAX - 4

function labelPrefix(typeName: string): string {
  return Array.from(typeName.trim()).slice(0, NAME_PART_MAX).join('').trimEnd()
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The label of the next token of a type: "<Type name> <n>", n one more than the highest
 * number among the type's labels of that form. A removed "Goblin 2" of three isn't
 * reused, and a renamed label doesn't count.
 */
export function nextLabel(
  type: Pick<PlaceableType, 'id' | 'name'>,
  tokens: readonly LocalCreatureToken[],
): string {
  const prefix = labelPrefix(type.name)
  const pattern = new RegExp(`^${escapeRegExp(prefix)} (\\d+)$`)
  let highest = 0
  for (const token of tokens) {
    if (token.creatureTypeId !== type.id) continue
    const match = pattern.exec(token.label)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `${prefix} ${highest + 1}`
}

/** A DM's label: trimmed, 1 to 40 characters. Null for anything else. */
export function cleanLabel(label: string): string | null {
  const trimmed = label.trim()
  const length = Array.from(trimmed).length
  return length >= 1 && length <= LABEL_MAX ? trimmed : null
}

/** A DM's encounter name: trimmed, 1 to 80 characters. Null for anything else. */
export function cleanEncounterName(name: string): string | null {
  const trimmed = name.trim()
  const length = Array.from(trimmed).length
  return length >= 1 && length <= ENCOUNTER_NAME_MAX ? trimmed : null
}

// --- Placement ------------------------------------------------------------------------

const grids = new WeakMap<object, MapGrid>()

/** The map's grid, built once per layout object. */
export function gridOf(map: Parameters<typeof buildGrid>[0]): MapGrid {
  let grid = grids.get(map.layout)
  // The size is part of the key: the same layout object could be read with another size.
  if (!grid || grid.width !== map.width || grid.height !== map.height) {
    grid = buildGrid(map)
    grids.set(map.layout, grid)
  }
  return grid
}

type Placed = Pick<LocalCreatureToken, 'id' | 'x' | 'y' | 'size'>

/** Whether a creature of this size may stand with its top-left corner at the cell. */
export function canStandAt(
  grid: MapGrid,
  tokens: readonly Placed[],
  size: CreatureSize,
  at: GridPoint,
  ignoreTokenId?: string,
): boolean {
  return fitsAt(grid, occupiedCells(tokens, ignoreTokenId), size, at.x, at.y)
}

/**
 * The tokens that don't stand validly on the map: partly outside, on cells nobody may
 * stand on, or overlapping another token (both are marked).
 */
export function misplacedIds(grid: MapGrid, tokens: readonly Placed[]): Set<string> {
  const bad = new Set<string>()
  for (const token of tokens) {
    if (!canStandAt(grid, tokens, token.size, token, token.id)) bad.add(token.id)
  }
  return bad
}

// --- Changes --------------------------------------------------------------------------

/** Places a new token of the type, labelled and sized from it. */
export function placeToken(
  doc: EncounterDoc,
  type: PlaceableType,
  at: GridPoint,
  id: string = crypto.randomUUID(),
): EncounterDoc {
  const token: LocalCreatureToken = {
    id,
    creatureTypeId: type.id,
    label: nextLabel(type, doc.tokens),
    x: at.x,
    y: at.y,
    size: type.size,
  }
  return { ...doc, tokens: [...doc.tokens, token] }
}

export function moveToken(doc: EncounterDoc, id: string, at: GridPoint): EncounterDoc {
  const token = doc.tokens.find((item) => item.id === id)
  if (!token || (token.x === at.x && token.y === at.y)) return doc
  return {
    ...doc,
    tokens: doc.tokens.map((item) => (item.id === id ? { ...item, x: at.x, y: at.y } : item)),
  }
}

export function removeToken(doc: EncounterDoc, id: string): EncounterDoc {
  if (!doc.tokens.some((item) => item.id === id)) return doc
  return { ...doc, tokens: doc.tokens.filter((item) => item.id !== id) }
}

/** Renames a token; an empty or too long label changes nothing. */
export function renameToken(doc: EncounterDoc, id: string, label: string): EncounterDoc {
  const clean = cleanLabel(label)
  const token = doc.tokens.find((item) => item.id === id)
  if (clean === null || !token || token.label === clean) return doc
  return {
    ...doc,
    tokens: doc.tokens.map((item) => (item.id === id ? { ...item, label: clean } : item)),
  }
}

export function renameEncounter(doc: EncounterDoc, name: string): EncounterDoc {
  const clean = cleanEncounterName(name)
  return clean === null || clean === doc.name ? doc : { ...doc, name: clean }
}

// --- Ready and starting ---------------------------------------------------------------

/** Why an encounter can't be marked ready or started right now; null when it can. */
export type NotReadyReason = 'archived' | 'misplaced'

export function notReadyReason(
  doc: Pick<EncounterDoc, 'archivedAt' | 'tokens'>,
  grid: MapGrid,
): NotReadyReason | null {
  if (doc.archivedAt !== null) return 'archived'
  return misplacedIds(grid, doc.tokens).size > 0 ? 'misplaced' : null
}

/**
 * Marks the encounter ready, or back to a draft. Ready is set by hand, never
 * automatically, and only when every creature stands validly on the current map.
 */
export function setReady(doc: EncounterDoc, grid: MapGrid, ready: boolean): EncounterDoc {
  const status: EncounterStatus = ready ? 'ready' : 'draft'
  if (doc.status === status) return doc
  if (doc.status !== 'draft' && doc.status !== 'ready') return doc
  if (ready && notReadyReason(doc, grid) !== null) return doc
  return { ...doc, status }
}

export function setArchived(doc: EncounterDoc, archivedAt: string | null): EncounterDoc {
  return (doc.archivedAt === null) === (archivedAt === null) ? doc : { ...doc, archivedAt }
}

// --- Drawing --------------------------------------------------------------------------

/**
 * A token as the board renderer draws it: creatures share one red ring. `imageUrl` is the
 * creature type's picked icon, when the editor is online and knows it.
 */
export function toBoardToken(
  token: LocalCreatureToken,
  grid: MapGrid,
  imageUrl: string | null = null,
): BoardToken {
  return {
    id: token.id,
    kind: 'creature',
    characterId: null,
    creatureTypeId: token.creatureTypeId,
    ownerUserId: null,
    label: token.label,
    x: token.x,
    y: token.y,
    elevation: placementElevation(grid, token.size, token.x, token.y),
    size: token.size,
    colorIndex: null,
    version: 0,
    imageUrl,
    color: null,
    statuses: [],
    hidden: false,
  }
}
