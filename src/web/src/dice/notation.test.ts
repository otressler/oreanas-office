import { describe, expect, it } from 'vitest'
import {
  displayNotation,
  formatNotation,
  groupRolls,
  parseNotation,
  rollD20,
  rollDie,
} from './notation'

describe('formatNotation', () => {
  it('writes dice the German way, sorted, with the modifier last', () => {
    expect(formatNotation([20, 6, 6], 3)).toBe('2W6 + W20 + 3')
    expect(formatNotation([100], -2)).toBe('W100 - 2')
  })

  it('keeps a lone modifier a plain number', () => {
    expect(formatNotation([], -2)).toBe('-2')
    expect(formatNotation([], 0)).toBe('')
  })
})

describe('parseNotation', () => {
  it('reads W and d notation alike', () => {
    expect(parseNotation('2W6+1w8+3')).toEqual({ dice: [6, 6, 8], modifier: 3 })
    expect(parseNotation('d20 - 1')).toEqual({ dice: [20], modifier: -1 })
    expect(parseNotation('W%')).toEqual({ dice: [100], modifier: 0 })
  })

  it('reads a minus sign or dash as minus', () => {
    expect(parseNotation('W20 − 2').modifier).toBe(-2)
    expect(parseNotation('W20 – 2').modifier).toBe(-2)
  })

  it('skips unknown and subtracted dice', () => {
    expect(parseNotation('W7 + W6 - W4')).toEqual({ dice: [6], modifier: 0 })
  })

  it('holds the modifier to ±99', () => {
    expect(parseNotation('W20+500').modifier).toBe(99)
  })

  it('round-trips what it writes', () => {
    const text = formatNotation([4, 20, 20, 100], -5)
    expect(parseNotation(text)).toEqual({ dice: [4, 20, 20, 100], modifier: -5 })
  })
})

describe('displayNotation', () => {
  it('uses a real minus sign', () => {
    expect(displayNotation('W20 - 1')).toBe('W20 − 1')
    expect(displayNotation('-2')).toBe('−2')
  })
})

describe('rollDie', () => {
  it('stays within 1 to n', () => {
    for (let i = 0; i < 500; i++) {
      const value = rollDie(6)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
    }
  })
})

describe('rollD20', () => {
  const sequence =
    (...values: number[]) =>
    () =>
      values.shift()!

  it('keeps the higher with advantage and drops the other', () => {
    expect(rollD20('advantage', sequence(4, 17))).toEqual({ value: 17, dropped: 4 })
  })

  it('keeps the lower with disadvantage and drops the other', () => {
    expect(rollD20('disadvantage', sequence(4, 17))).toEqual({ value: 4, dropped: 17 })
  })

  it('rolls once for a normal roll', () => {
    expect(rollD20('normal', sequence(11))).toEqual({ value: 11, dropped: null })
  })
})

describe('groupRolls', () => {
  it('groups by die in the order of the dice', () => {
    const roll = (value: number) => ({ value, dropped: null })
    expect(
      groupRolls([
        { sides: 20, roll: roll(5) },
        { sides: 6, roll: roll(2) },
        { sides: 6, roll: roll(3) },
      ]),
    ).toEqual([
      { sides: 6, rolls: [roll(2), roll(3)] },
      { sides: 20, rolls: [roll(5)] },
    ])
  })
})
