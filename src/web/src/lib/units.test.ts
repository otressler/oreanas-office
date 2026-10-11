import { describe, expect, it } from 'vitest'
import {
  SQUARE_METERS,
  formatMeters,
  formatMetersInput,
  isWholeSquares,
  metersToSquares,
  parseMeters,
  squaresToMeters,
} from './units'

describe('units', () => {
  it('uses 1.5 m per square', () => {
    expect(SQUARE_METERS).toBe(1.5)
  })

  it('converts squares to meters', () => {
    expect(squaresToMeters(5)).toBe(7.5)
    expect(squaresToMeters(6)).toBe(9)
    expect(squaresToMeters(0)).toBe(0)
  })

  it('converts meters to whole squares (rulebook speeds)', () => {
    expect(metersToSquares(9)).toBe(6)
    expect(metersToSquares(7.5)).toBe(5)
    expect(metersToSquares(4.5)).toBe(3)
    expect(metersToSquares(0)).toBe(0)
  })

  it('drops a remainder smaller than a square', () => {
    expect(metersToSquares(10)).toBe(6)
    expect(metersToSquares(1.4)).toBe(0)
  })

  it('formats squares as German meters', () => {
    // Examples from knowledge/rules/movement-distance.md
    expect(formatMeters(5)).toBe('7,5 m')
    expect(formatMeters(6)).toBe('9 m')
    expect(formatMeters(2)).toBe('3 m')
    expect(formatMeters(1)).toBe('1,5 m')
    expect(formatMeters(0)).toBe('0 m')
  })

  it('uses German digit grouping for long distances', () => {
    expect(formatMeters(1001)).toBe('1.501,5 m')
  })
})

describe('parseMeters', () => {
  it('accepts a German decimal comma and a decimal point', () => {
    expect(parseMeters('7,5')).toBe(7.5)
    expect(parseMeters('7.5')).toBe(7.5)
    expect(parseMeters('9')).toBe(9)
    expect(parseMeters(',5')).toBe(0.5)
    expect(parseMeters('9,')).toBe(9)
  })

  it('ignores spaces and a trailing unit', () => {
    expect(parseMeters('  9  ')).toBe(9)
    expect(parseMeters('9 m')).toBe(9)
    expect(parseMeters('7,5m')).toBe(7.5)
    expect(parseMeters('10 M')).toBe(10)
  })

  it('rejects anything that is not a non-negative number', () => {
    for (const input of ['', ' ', 'm', 'neun', '-3', '9 ft', '1,5,3', '7.5.1', '1e3', '9 m m']) {
      expect(parseMeters(input), input).toBeNull()
    }
  })

  it('feeds the conversion to squares, rounding down', () => {
    // knowledge/rules/movement-distance.md: 10 m → 6 squares, shown as 9 m.
    const squares = metersToSquares(parseMeters('10')!)
    expect(squares).toBe(6)
    expect(formatMeters(squares)).toBe('9 m')
    expect(metersToSquares(parseMeters('7,5')!)).toBe(5)
  })
})

describe('isWholeSquares', () => {
  it('is true for multiples of 1.5 m', () => {
    expect(isWholeSquares(0)).toBe(true)
    expect(isWholeSquares(1.5)).toBe(true)
    expect(isWholeSquares(4.5)).toBe(true)
    expect(isWholeSquares(9)).toBe(true)
  })

  it('is false when a remainder would be dropped', () => {
    expect(isWholeSquares(10)).toBe(false)
    expect(isWholeSquares(1)).toBe(false)
    expect(isWholeSquares(7.4)).toBe(false)
  })
})

describe('formatMetersInput', () => {
  it('writes squares as an editable German number without unit or grouping', () => {
    expect(formatMetersInput(6)).toBe('9')
    expect(formatMetersInput(5)).toBe('7,5')
    expect(formatMetersInput(1001)).toBe('1501,5')
  })

  it('round-trips through parseMeters', () => {
    for (const squares of [0, 1, 5, 6, 7, 1001]) {
      expect(metersToSquares(parseMeters(formatMetersInput(squares))!)).toBe(squares)
    }
  })
})
