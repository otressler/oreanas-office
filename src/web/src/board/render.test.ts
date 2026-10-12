// The canvas drawing itself is checked with screenshots (board lab); these are its
// pure helpers.
import { describe, expect, it } from 'vitest'
import { gridAlpha, visibleCells } from './render'
import { CELL } from './viewport'

describe('visibleCells', () => {
  it('covers the canvas plus one spare cell, within the map', () => {
    // 2 device pixels per world unit: a cell is 128 px; the map starts at (-300, 50).
    const m = { a: 2, d: 2, e: -300, f: 50 }
    expect(visibleCells(m, 1000, 600, 40, 38)).toEqual({ x0: 1, y0: 0, x1: 12, y1: 6 })
  })

  it('is empty when the map is off the canvas', () => {
    const m = { a: 1, d: 1, e: 5000, f: 0 }
    const view = visibleCells(m, 800, 600, 10, 10)
    expect(view.x1 - view.x0).toBeLessThanOrEqual(0)
  })

  it('is the whole map when everything fits', () => {
    const m = { a: 10 / CELL, d: 10 / CELL, e: 20, f: 20 }
    expect(visibleCells(m, 1000, 1000, 40, 38)).toEqual({ x0: 0, y0: 0, x1: 40, y1: 38 })
  })
})

describe('gridAlpha', () => {
  it('fades the grid out on tiny cells and keeps it steady when large', () => {
    expect(gridAlpha(4, 1)).toBe(0)
    expect(gridAlpha(9, 1)).toBeGreaterThan(0)
    expect(gridAlpha(14, 1)).toBe(gridAlpha(400, 1))
    // The same cell size in CSS pixels looks the same at any pixel ratio.
    expect(gridAlpha(9 * 3, 3)).toBeCloseTo(gridAlpha(9, 1))
  })
})
