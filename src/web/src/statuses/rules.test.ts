import { describe, expect, it } from 'vitest'
import { moveInList } from './queries'
import { canAddStatus, canRemoveStatus, clampLevel, personName } from './rules'
import { statusLetter, statusName } from './names'

const ME = 'me'
const player = { isSessionDm: false }
const dm = { isSessionDm: true }

describe('canAddStatus', () => {
  it('lets players put statuses on creatures and their own characters only', () => {
    expect(canAddStatus({ kind: 'creature', ownerUserId: null }, player, ME)).toBe(true)
    expect(canAddStatus({ kind: 'character', ownerUserId: ME }, player, ME)).toBe(true)
    expect(canAddStatus({ kind: 'character', ownerUserId: 'other' }, player, ME)).toBe(false)
  })

  it('lets the session DM put statuses on any token', () => {
    expect(canAddStatus({ kind: 'character', ownerUserId: 'other' }, dm, ME)).toBe(true)
  })

  it('lets a shared screen put statuses on any character and creature', () => {
    expect(canAddStatus({ kind: 'character', ownerUserId: 'other' }, player, ME, true)).toBe(true)
    expect(canAddStatus({ kind: 'creature', ownerUserId: null }, player, ME, true)).toBe(true)
  })
})

describe('canRemoveStatus', () => {
  it('lets players take off the statuses they put on, the session DM any', () => {
    expect(canRemoveStatus({ appliedByUserId: ME, fromSharedScreen: false }, player, ME)).toBe(true)
    expect(canRemoveStatus({ appliedByUserId: 'dm', fromSharedScreen: false }, player, ME)).toBe(
      false,
    )
    expect(canRemoveStatus({ appliedByUserId: 'other', fromSharedScreen: false }, dm, ME)).toBe(
      true,
    )
  })

  it('lets a shared screen take off only the statuses that came from a shared screen', () => {
    const fromTable = { appliedByUserId: ME, fromSharedScreen: true }
    const fromPhone = { appliedByUserId: ME, fromSharedScreen: false }
    expect(canRemoveStatus(fromTable, player, ME, true)).toBe(true)
    expect(canRemoveStatus(fromPhone, player, ME, true)).toBe(false)
    // Even signed in as the session DM, the shared screen is no session DM.
    expect(canRemoveStatus(fromPhone, dm, ME, true)).toBe(false)
  })
})

describe('helpers', () => {
  it('keeps levels between 1 and 6', () => {
    expect(clampLevel(0)).toBe(1)
    expect(clampLevel(4)).toBe(4)
    expect(clampLevel(9)).toBe(6)
  })

  it('finds a person’s name', () => {
    const people = [{ userId: ME, displayName: 'Eli', pingColor: '#ffffff' }]
    expect(personName(people, ME)).toBe('Eli')
    expect(personName(people, 'gone')).toBeNull()
    expect(personName(people, null)).toBeNull()
  })

  it('names library statuses in German and custom ones by their own name', () => {
    expect(statusName({ libraryKey: 'prone', name: 'Prone' })).toBe('Liegend')
    expect(statusName({ libraryKey: null, name: 'Verhext' })).toBe('Verhext')
    expect(statusLetter({ libraryKey: null, name: ' verhext' })).toBe('V')
  })

  it('moves an id up or down in a list, and keeps it at the ends', () => {
    expect(moveInList(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveInList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveInList(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveInList(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })
})
