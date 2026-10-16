// The drawing itself is checked by eye in the board lab; these are its pure helpers.
import { describe, expect, it } from 'vitest'
import { ARROW_MS, PING_MS, type ShownPing } from './pings'
import {
  ARROW_FADE_MS,
  pingAnimates,
  pingOpacity,
  pingPoints,
  type PlacedToken,
} from './pingRender'
import { CELL } from './viewport'

const base = { id: 'p', userId: 'u', color: '#4da3ff', name: 'Mira', at: 1000 }
const cellPing: ShownPing = { ...base, kind: 'cell', cell: { x: 2, y: 3 } }
const tokenPing: ShownPing = { ...base, kind: 'token', tokenId: 'ogre' }
const arrow: ShownPing = {
  ...base,
  kind: 'arrow',
  from: { tokenId: 'ogre' },
  to: { x: 8, y: 1 },
  done: true,
}
const ogre: PlacedToken = { x: 4, y: 4, size: 'large' }
const lookup = (id: string) => (id === 'ogre' ? ogre : undefined)

describe('pingPoints', () => {
  it('points at a cell’s middle', () => {
    const c = { x: 2.5 * CELL, y: 3.5 * CELL }
    expect(pingPoints(cellPing, lookup)).toEqual({ target: c, visible: [c] })
  })

  it('follows the token, and has no points once it is gone', () => {
    expect(pingPoints(tokenPing, lookup)?.target).toEqual({ x: 5 * CELL, y: 5 * CELL })
    expect(pingPoints(tokenPing, () => undefined)).toBeNull()
  })

  it('aims at an arrow’s middle and sees it by either end', () => {
    const points = pingPoints(arrow, lookup)!
    expect(points.target).toEqual({
      x: (5 * CELL + 8.5 * CELL) / 2,
      y: (5 * CELL + 1.5 * CELL) / 2,
    })
    expect(points.visible).toHaveLength(2)
  })
})

describe('pingOpacity and pingAnimates', () => {
  it('pulses a ping for its whole time and fades its end', () => {
    expect(pingOpacity(cellPing, 1000, true)).toBe(1)
    expect(pingAnimates(cellPing, 1500, true)).toBe(true)
    expect(pingOpacity(cellPing, 1000 + PING_MS - 200, true)).toBeCloseTo(0.5)
    expect(pingOpacity(cellPing, 1000 + PING_MS, true)).toBe(0)
    expect(pingAnimates(cellPing, 1000 + PING_MS, true)).toBe(false)
  })

  it('holds an arrow still until its last second, then fades it', () => {
    expect(pingAnimates(arrow, 2000, true)).toBe(false)
    expect(pingOpacity(arrow, 2000, true)).toBe(1)
    const fading = 1000 + ARROW_MS - ARROW_FADE_MS / 2
    expect(pingAnimates(arrow, fading, true)).toBe(true)
    expect(pingOpacity(arrow, fading, true)).toBeCloseTo(0.5)
  })

  it('never fades the own arrow being drawn', () => {
    const drawing = { ...arrow, done: false } as ShownPing
    expect(pingOpacity(drawing, 1000 + ARROW_MS - 100, true)).toBe(1)
    expect(pingAnimates(drawing, 1500, true)).toBe(false)
  })

  it('stands still with reduced motion, and simply ends', () => {
    expect(pingAnimates(cellPing, 1500, false)).toBe(false)
    expect(pingOpacity(cellPing, 1000 + PING_MS - 10, false)).toBe(1)
    expect(pingOpacity(arrow, 1000 + ARROW_MS - 10, false)).toBe(1)
    expect(pingOpacity(arrow, 1000 + ARROW_MS, false)).toBe(0)
  })
})
