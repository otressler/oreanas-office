import { describe, expect, it } from 'vitest'
import {
  SQUARE_METERS,
  formatElevation,
  formatElevationInput,
  formatMeters,
  parseElevationInput,
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

describe('formatElevation', () => {
  it('shows meters with one decimal in German format', () => {
    expect(formatElevation(1.5)).toBe('1,5 m')
    expect(formatElevation(0)).toBe('0 m')
    expect(formatElevation(4)).toBe('4 m')
    expect(formatElevation(2.25)).toBe('2,3 m')
    expect(formatElevation(-3)).toBe('-3 m')
  })

  it('never shows a negative zero', () => {
    expect(formatElevation(-0)).toBe('0 m')
    expect(formatElevation(-0.04)).toBe('0 m')
  })
})

describe('elevation input', () => {
  it('reads German and English decimals, signs and a unit', () => {
    expect(parseElevationInput('1,5')).toBe(1.5)
    expect(parseElevationInput('1.5')).toBe(1.5)
    expect(parseElevationInput('-3')).toBe(-3)
    expect(parseElevationInput('−1,5')).toBe(-1.5)
    expect(parseElevationInput('–1,5')).toBe(-1.5)
    expect(parseElevationInput('+3')).toBe(3)
    expect(parseElevationInput(' 2,5 m ')).toBe(2.5)
    expect(parseElevationInput('-0')).toBe(0)
    expect(Object.is(parseElevationInput('-0'), -0)).toBe(false)
    expect(parseElevationInput(',5')).toBe(0.5)
    expect(parseElevationInput('9999,9')).toBe(9999.9)
  })

  it('rejects anything else', () => {
    for (const input of ['', '-', 'abc', '1,25', '1,5,5', '10000', '-10000', '1e3', '3 ft'])
      expect(parseElevationInput(input), input).toBeNull()
  })

  it('writes elevations for an input field', () => {
    expect(formatElevationInput(1.5)).toBe('1,5')
    expect(formatElevationInput(-3)).toBe('-3')
    expect(formatElevationInput(2500)).toBe('2500')
    expect(formatElevationInput(-0)).toBe('0')
  })
})
