import { describe, expect, it } from 'vitest'
import { formatDate, todayIso } from './dates'

describe('dates', () => {
  it('formats a calendar date in German, on that very day', () => {
    expect(formatDate('2026-10-11')).toBe('So., 11. Oktober 2026')
    expect(formatDate('2027-01-01')).toBe('Fr., 1. Januar 2027')
  })

  it("gives today's local date in input format", () => {
    expect(todayIso(new Date(2026, 9, 11, 23, 59))).toBe('2026-10-11')
    expect(todayIso(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })
})
