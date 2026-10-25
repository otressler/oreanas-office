import { describe, expect, it } from 'vitest'
import type { BoardState, BoardToken, InitiativeEntry } from '../api/types'
import { smallBoard } from '../encounters/testing'
import {
  applyInitiative,
  formatModifier,
  moveEntry,
  newerInitiative,
  parseWhole,
  reroll,
  setRollMode,
  setModifier,
  setValue,
  setupEntries,
  shownEntries,
  sortedForSave,
} from './initiative'

const entry = (tokenId: string, value: number | null, fields: Partial<InitiativeEntry> = {}) => ({
  tokenId,
  value,
  modifier: 0,
  mode: 'normal' as const,
  rolls: [],
  ...fields,
})

const token = (id: string, kind: BoardToken['kind'] = 'creature'): BoardToken => ({
  ...smallBoard().tokens[0]!,
  id,
  kind,
  label: id,
})

/** Dice that roll these numbers in turn. */
const dice =
  (...rolls: number[]) =>
  () =>
    rolls.shift()!

const ids = (entries: readonly InitiativeEntry[]) => entries.map((e) => e.tokenId)

describe('which list is newer', () => {
  it('keeps the higher version, the first one on a tie, and either one when the other is missing', () => {
    const a = { version: 2, entries: [] }
    const b = { version: 3, entries: null }
    expect(newerInitiative(a, b)).toBe(b)
    expect(newerInitiative(b, a)).toBe(b)
    expect(newerInitiative(a, { version: 2, entries: null })).toBe(a)
    expect(newerInitiative(null, a)).toBe(a)
    expect(newerInitiative(a, undefined)).toBe(a)
  })

  it('takes a change into the board only when it is newer and for this encounter', () => {
    const board: BoardState = { ...smallBoard(), initiative: { version: 2, entries: [] } }
    const newer = { encounterId: board.encounterId, initiative: { version: 3, entries: null } }
    expect(applyInitiative(board, newer).initiative).toEqual(newer.initiative)
    const older = { ...newer, initiative: { version: 1, entries: null } }
    expect(applyInitiative(board, older)).toBe(board)
    expect(applyInitiative(board, { ...newer, encounterId: 'other' })).toBe(board)
  })
})

describe('the list as the panel shows it', () => {
  it('leaves out entries of tokens that are off the board', () => {
    const shown = shownEntries(
      [entry('a', 5), entry('gone', 9), entry('b', 1)],
      [token('b'), token('a')],
    )
    expect(shown.map((s) => s.token.id)).toEqual(['a', 'b'])
  })

  it('moves an entry among the shown ones and keeps hidden ones next to their neighbours', () => {
    const entries = [entry('a', 20), entry('gone', 15), entry('b', 10), entry('c', 5)]
    const shownIds = ['a', 'b', 'c']
    expect(ids(moveEntry(entries, shownIds, 0, 2))).toEqual(['gone', 'b', 'c', 'a'])
    expect(ids(moveEntry(entries, shownIds, 2, 0))).toEqual(['c', 'a', 'gone', 'b'])
    expect(ids(moveEntry(entries, shownIds, 0, 1))).toEqual(['gone', 'b', 'a', 'c'])
    expect(ids(moveEntry(entries, shownIds, 1, 1))).toEqual(['a', 'gone', 'b', 'c'])
  })
})

describe('the setup screen', () => {
  it('starts from saved entries, then fresh rolls, characters first; removed tokens are kept aside', () => {
    const tokens = [token('gob'), token('hero', 'character'), token('ogre')]
    const { entries, kept } = setupEntries(
      [entry('gob', 12), entry('gone', 3)],
      [entry('gob', 7), entry('ogre', 9, { rolls: [9] })],
      tokens,
    )
    expect(entries).toEqual([
      entry('hero', null),
      entry('gob', 12),
      entry('ogre', 9, { rolls: [9] }),
    ])
    expect(kept).toEqual([entry('gone', 3)])
  })

  it('keeps a creature’s value with its d20s and modifier, and a typed value replaces the roll', () => {
    const rolled = entry('gob', 14, { modifier: 2, rolls: [12] })
    expect(setModifier(rolled, -1)).toMatchObject({ value: 11, modifier: -1 })
    // Advantage and disadvantage add a d20 and keep the higher or the lower; back to normal
    // keeps the first.
    const advantage = setRollMode(rolled, 'advantage', dice(17))
    expect(advantage).toMatchObject({ value: 19, rolls: [12, 17] })
    expect(setRollMode(advantage, 'disadvantage', dice())).toMatchObject({
      mode: 'disadvantage',
      value: 14,
      rolls: [12, 17],
    })
    expect(setRollMode(rolled, 'disadvantage', dice(5))).toMatchObject({ value: 7, rolls: [12, 5] })
    expect(setRollMode(advantage, 'normal', dice())).toMatchObject({ value: 14, rolls: [12] })
    expect(reroll({ ...rolled, mode: 'advantage' }, dice(3, 8))).toMatchObject({
      value: 10,
      rolls: [3, 8],
    })
    expect(reroll({ ...rolled, mode: 'disadvantage' }, dice(3, 8))).toMatchObject({
      value: 5,
      rolls: [3, 8],
    })
    const typed = setValue(rolled, 18)
    expect(typed).toMatchObject({ value: 18, rolls: [] })
    expect(setModifier(typed, 5).value).toBe(18)
  })

  it('saves the highest value first, without a value last, then by modifier, else as the list was', () => {
    const previous = [entry('b', 10), entry('a', 10)]
    const sorted = sortedForSave(
      [
        entry('a', 10),
        entry('none', null),
        entry('b', 10),
        entry('high', 15),
        entry('quick', 10, { modifier: 3 }),
      ],
      previous,
    )
    expect(ids(sorted)).toEqual(['high', 'quick', 'b', 'a', 'none'])
  })

  it('reads whole numbers within the limits and writes modifiers with their sign', () => {
    expect(parseWhole(' -3 ', -10, 20)).toBe(-3)
    expect(parseWhole('+4', -10, 20)).toBe(4)
    expect(parseWhole('−2', -10, 20)).toBe(-2)
    for (const text of ['', '1.5', 'abc', '21']) expect(parseWhole(text, -10, 20)).toBeNull()
    expect([formatModifier(2), formatModifier(0), formatModifier(-1)]).toEqual(['+2', '0', '−1'])
  })
})
