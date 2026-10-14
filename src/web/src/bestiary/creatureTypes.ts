// Creature types in the browser (knowledge/domain/creature-type.md): the campaign's
// bestiary. Every change marks the type as not synced; nothing is ever deleted.
import { useLiveQuery } from 'dexie-react-hooks'
import type { CreatureSize } from '../api/types'
import type { OfflineDb } from '../offline/db'
import { LOCAL_CREATURE_TYPE_RECORD_VERSION, type LocalCreatureType } from '../offline/model'
import { markChanged, newSyncState } from '../offline/sync'

/** The server's limits (CreatureType.NameMaxLength and the text limits). */
export const CREATURE_NAME_MAX = 40
export const CREATURE_APPEARANCE_MAX = 500
export const CREATURE_NOTES_MAX = 2000

export const CREATURE_SIZES: readonly CreatureSize[] = [
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
]

/** What the form edits. */
export interface CreatureTypeInput {
  name: string
  size: CreatureSize
  appearance: string
  notes: string
}

export type CreatureTypeProblem =
  'nameMissing' | 'nameTooLong' | 'nameTaken' | 'appearanceTooLong' | 'notesTooLong'

export type CreatureTypeResult =
  { ok: true; type: LocalCreatureType } | { ok: false; problems: CreatureTypeProblem[] }

const now = () => new Date().toISOString()

const collator = new Intl.Collator('de-DE', { numeric: true })

/** The trimmed, case-insensitive form names are compared by. */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de-DE')
}

/** The campaign's types, archived ones included, by name. */
export async function listCreatureTypes(
  db: OfflineDb,
  campaignId: string,
): Promise<LocalCreatureType[]> {
  const types = await db.creatureTypes.where('campaignId').equals(campaignId).toArray()
  return types.sort(
    (a, b) => collator.compare(a.name, b.name) || a.createdAt.localeCompare(b.createdAt),
  )
}

/** The campaign's types, live; undefined while loading. */
export function useCreatureTypes(
  db: OfflineDb,
  campaignId: string,
): LocalCreatureType[] | undefined {
  return useLiveQuery(() => listCreatureTypes(db, campaignId), [db, campaignId])
}

/**
 * What is wrong with the input. `others` are the campaign's other types, archived ones
 * included: a name stays taken while its type is archived.
 */
export function checkCreatureType(
  input: CreatureTypeInput,
  others: readonly Pick<LocalCreatureType, 'name'>[],
): CreatureTypeProblem[] {
  const problems: CreatureTypeProblem[] = []
  const name = input.name.trim()
  if (!name) problems.push('nameMissing')
  else if (Array.from(name).length > CREATURE_NAME_MAX) problems.push('nameTooLong')
  else if (others.some((other) => nameKey(other.name) === nameKey(name))) problems.push('nameTaken')
  if (Array.from(input.appearance).length > CREATURE_APPEARANCE_MAX)
    problems.push('appearanceTooLong')
  if (Array.from(input.notes).length > CREATURE_NOTES_MAX) problems.push('notesTooLong')
  return problems
}

/** A new type in the campaign, with an id made here. */
export async function createCreatureType(
  db: OfflineDb,
  campaignId: string,
  input: CreatureTypeInput,
): Promise<CreatureTypeResult> {
  return db.transaction('rw', db.creatureTypes, async () => {
    const others = await db.creatureTypes.where('campaignId').equals(campaignId).toArray()
    const problems = checkCreatureType(input, others)
    if (problems.length > 0) return { ok: false, problems }
    const time = now()
    const type: LocalCreatureType = {
      id: crypto.randomUUID(),
      campaignId,
      name: input.name.trim(),
      size: input.size,
      appearance: input.appearance,
      notes: input.notes,
      archivedAt: null,
      createdAt: time,
      updatedAt: time,
      sync: newSyncState(),
      recordVersion: LOCAL_CREATURE_TYPE_RECORD_VERSION,
    }
    await db.creatureTypes.add(type)
    return { ok: true, type }
  })
}

/**
 * Saves a type's fields. Tokens already placed keep the size they had
 * (knowledge/rules/creature-size.md); only new tokens use the new one.
 */
export async function saveCreatureType(
  db: OfflineDb,
  id: string,
  input: CreatureTypeInput,
): Promise<CreatureTypeResult> {
  return db.transaction('rw', db.creatureTypes, async () => {
    const stored = await db.creatureTypes.get(id)
    if (!stored) return { ok: false, problems: [] }
    const others = (
      await db.creatureTypes.where('campaignId').equals(stored.campaignId).toArray()
    ).filter((other) => other.id !== id)
    const problems = checkCreatureType(input, others)
    if (problems.length > 0) return { ok: false, problems }
    const type: LocalCreatureType = {
      ...stored,
      name: input.name.trim(),
      size: input.size,
      appearance: input.appearance,
      notes: input.notes,
      updatedAt: now(),
      sync: markChanged(stored.sync),
    }
    await db.creatureTypes.put(type)
    return { ok: true, type }
  })
}

/** Archives a type, or brings it back. Placed tokens are not touched. */
export async function setCreatureTypeArchived(
  db: OfflineDb,
  id: string,
  archived: boolean,
): Promise<void> {
  await db.transaction('rw', db.creatureTypes, async () => {
    const stored = await db.creatureTypes.get(id)
    if (!stored || (stored.archivedAt !== null) === archived) return
    await db.creatureTypes.put({
      ...stored,
      archivedAt: archived ? now() : null,
      updatedAt: now(),
      sync: markChanged(stored.sync),
    })
  })
}
