import { describe, expect, it } from 'vitest'
import { SQUARE_METERS, formatMeters, metersToSquares, squaresToMeters } from './units'

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
