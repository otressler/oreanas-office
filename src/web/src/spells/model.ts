// Spell card facts shared by the spell pages (knowledge/features/spell-cards.md).
import type { SpellSchool, SpellSummary } from '../api/types'
import { SPELL_ICONS } from './iconPaths'

export type SpellIconName = keyof typeof SPELL_ICONS

export const SPELL_ICON_NAMES = Object.keys(SPELL_ICONS) as SpellIconName[]

/** Mirrors SpellCards on the server. */
export const SPELL_LIMITS = {
  nameEn: 60,
  name: 60,
  stat: 40,
  description: 3000,
  effects: 6,
  tables: 3,
  tableCaption: 80,
  tableRows: 12,
  tableKey: 6,
  tableTitle: 30,
  tableText: 300,
  effectTitle: 30,
  effectTag: 24,
  effectText: 200,
  chipBig: 12,
  chipSmall: 14,
  higherLevels: 300,
  tip: 200,
  material: 120,
  source: 60,
} as const

export const SCHOOLS: SpellSchool[] = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]

/** Card width and height in CSS pixels at zoom 1 (70 × 120 mm at 96 dpi). */
export const CARD_WIDTH_PX = (70 * 96) / 25.4
export const CARD_HEIGHT_PX = (120 * 96) / 25.4

/** Lower case without diacritics, so "mondstrahl" finds "Mondstrahl". */
export const searchKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function matchesSpell(spell: Pick<SpellSummary, 'name' | 'nameEn'>, query: string) {
  const q = searchKey(query.trim())
  return !q || searchKey(spell.name).includes(q) || searchKey(spell.nameEn).includes(q)
}
