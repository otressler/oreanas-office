// The 2024 Player's Handbook's classes and subclasses (knowledge/rules/handbook-classes.md):
// the list from the server, a character's classes as text, and which spells a character's
// classes offer, for the spell filters.
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CharacterClassEntry, ClassInfo, SpellListLink } from '../api/types'

/** Mirrors CharacterClassLevel on the server. */
export const CLASS_LIMITS = {
  /** A class's level, and all of a character's levels together. */
  maxLevel: 20,
  /** The class level from which a class has a subclass. */
  subclassLevel: 3,
} as const

export const classKeys = { all: ['rules', 'classes'] as const }

/** The Handbook's classes; reference data that doesn't change while the app runs. */
export function useClasses() {
  return useQuery({
    queryKey: classKeys.all,
    queryFn: () => unwrap(api.GET('/api/rules/classes')),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export interface ClassIndex {
  classes: ClassInfo[]
  /** By class id. */
  classById: ReadonlyMap<string, ClassInfo>
  /** By subclass id, with its class. */
  subclassById: ReadonlyMap<
    string,
    { subclass: ClassInfo['subclasses'][number]; classInfo: ClassInfo }
  >
}

export function indexClasses(classes: ClassInfo[]): ClassIndex {
  return {
    classes,
    classById: new Map(classes.map((c) => [c.id, c])),
    subclassById: new Map(
      classes.flatMap((classInfo) =>
        classInfo.subclasses.map((subclass) => [subclass.id, { subclass, classInfo }] as const),
      ),
    ),
  }
}

/** "Magier 5 (Hervorrufer) · Kämpfer 2"; ids stand in for names the list doesn't have. */
export function classesText(entries: readonly CharacterClassEntry[], index?: ClassIndex): string {
  return entries
    .map((entry) => {
      const name = index?.classById.get(entry.classId)?.nameDe ?? entry.classId
      const subclass = entry.subclassId
        ? (index?.subclassById.get(entry.subclassId)?.subclass.nameDe ?? entry.subclassId)
        : null
      return subclass ? `${name} ${entry.level} (${subclass})` : `${name} ${entry.level}`
    })
    .join(' · ')
}

/** The total of a character's class levels: its character level. */
export const totalLevel = (entries: readonly CharacterClassEntry[]) =>
  entries.reduce((sum, entry) => sum + entry.level, 0)

/**
 * What a filter by classes lets through: the lists of these classes (including the one a
 * subclass casts from, like the Eldritch Knight's Wizard list) and the spells these subclasses
 * grant. Class levels aren't checked yet: `classLevel` on a grant is there for that later.
 */
export interface SpellFilter {
  classIds: ReadonlySet<string>
  subclassIds: ReadonlySet<string>
}

/** The filter for a character's classes and subclasses. */
export function characterSpellFilter(
  entries: readonly CharacterClassEntry[],
  index?: ClassIndex,
): SpellFilter {
  const classIds = new Set(entries.map((e) => e.classId))
  const subclassIds = new Set<string>()
  for (const entry of entries) {
    if (!entry.subclassId) continue
    subclassIds.add(entry.subclassId)
    const listClass = index?.subclassById.get(entry.subclassId)?.subclass.spellListClassId
    if (listClass) classIds.add(listClass)
  }
  return { classIds, subclassIds }
}

/** The filter for one class, or one subclass with its class, picked in the library. */
export function pickedSpellFilter(
  classId: string,
  subclassId: string | null,
  index?: ClassIndex,
): SpellFilter {
  return characterSpellFilter([{ classId, level: CLASS_LIMITS.maxLevel, subclassId }], index)
}

export function spellMatchesFilter(lists: readonly SpellListLink[], filter: SpellFilter): boolean {
  return lists.some((link) =>
    link.subclassId ? filter.subclassIds.has(link.subclassId) : filter.classIds.has(link.classId),
  )
}
