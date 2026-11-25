import { describe, expect, it } from 'vitest'
import type { SpellListLink } from '../api/types'
import { testClasses } from '../test/api'
import {
  characterSpellFilter,
  classesText,
  indexClasses,
  pickedSpellFilter,
  spellMatchesFilter,
  totalLevel,
} from './classes'

const index = indexClasses(testClasses)

const moonbeam: SpellListLink[] = [
  { classId: 'druid', subclassId: null, classLevel: null },
  { classId: 'druid', subclassId: 'circle-of-the-moon', classLevel: 3 },
  { classId: 'paladin', subclassId: 'oath-of-the-ancients', classLevel: 5 },
]
const fireBolt: SpellListLink[] = [
  { classId: 'sorcerer', subclassId: null, classLevel: null },
  { classId: 'wizard', subclassId: null, classLevel: null },
  { classId: 'druid', subclassId: 'circle-of-the-land', classLevel: 3 },
]

describe('classes', () => {
  it('writes a character’s classes with levels and subclasses', () => {
    const classes = [
      { classId: 'wizard', level: 5, subclassId: 'evoker' },
      { classId: 'fighter', level: 2, subclassId: null },
    ]
    expect(classesText(classes, index)).toBe('Magier 5 (Hervorrufer) · Kämpfer 2')
    expect(classesText(classes)).toBe('wizard 5 (evoker) · fighter 2')
    expect(totalLevel(classes)).toBe(7)
  })

  it('filters by the class lists of a character’s classes', () => {
    const druid = characterSpellFilter([{ classId: 'druid', level: 2, subclassId: null }], index)
    expect(spellMatchesFilter(moonbeam, druid)).toBe(true)
    expect(spellMatchesFilter(fireBolt, druid)).toBe(false)
  })

  it('adds the spells a subclass grants, whatever the level', () => {
    const land = characterSpellFilter(
      [{ classId: 'druid', level: 3, subclassId: 'circle-of-the-land' }],
      index,
    )
    expect(spellMatchesFilter(fireBolt, land)).toBe(true)
    // A paladin without the Oath of the Ancients doesn't get Moonbeam from it.
    const paladin = characterSpellFilter([{ classId: 'paladin', level: 9, subclassId: null }])
    expect(spellMatchesFilter(moonbeam, paladin)).toBe(false)
  })

  it('gives an Eldritch Knight the Wizard list', () => {
    const knight = characterSpellFilter(
      [{ classId: 'fighter', level: 3, subclassId: 'eldritch-knight' }],
      index,
    )
    expect(spellMatchesFilter(fireBolt, knight)).toBe(true)
    expect(spellMatchesFilter(fireBolt, pickedSpellFilter('fighter', null, index))).toBe(false)
    expect(
      spellMatchesFilter(fireBolt, pickedSpellFilter('fighter', 'eldritch-knight', index)),
    ).toBe(true)
  })
})
