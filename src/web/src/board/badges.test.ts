import { describe, expect, it } from 'vitest'
import type { BoardTokenStatus } from '../api/types'
import { BADGE_MIN_RADIUS_PX, MAX_BADGES, badgeLayout } from './badges'

const status = (id: string, level: number | null = null): BoardTokenStatus => ({
  statusId: id,
  level,
  appliedByUserId: 'u',
  appliedAt: '2026-10-16T10:00:00Z',
})

const statuses = (n: number) => Array.from({ length: n }, (_, i) => status(`s${i}`))

describe('badgeLayout', () => {
  // A medium token at 1 CSS pixel per world unit: radius 26.9 px, middle (32, 32).
  const r = 64 * 0.42

  it('is empty without statuses', () => {
    expect(badgeLayout([], 32, 32, r, 1).slots).toEqual([])
  })

  it('puts up to three icons in a row centred along the upper edge', () => {
    const layout = badgeLayout(statuses(3), 32, 32, r, 1)
    expect(layout.slots.map((s) => s.kind)).toEqual(['icon', 'icon', 'icon'])
    expect(layout.slots.every((s) => s.y === 32 - r)).toBe(true)
    const xs = layout.slots.map((s) => s.x)
    expect((xs[0]! + xs[2]!) / 2).toBeCloseTo(32)
    // Neighbours barely overlap.
    expect(xs[1]! - xs[0]!).toBeCloseTo(layout.radius * 1.9)
  })

  it('shows the rest as "+N" after three icons', () => {
    const layout = badgeLayout(statuses(5), 32, 32, r, 1)
    expect(layout.slots).toHaveLength(MAX_BADGES + 1)
    expect(layout.slots.at(-1)).toMatchObject({ kind: 'count', text: '+2' })
    expect(layout.slots.slice(0, 3).map((s) => s.kind === 'icon' && s.status.statusId)).toEqual([
      's0',
      's1',
      's2',
    ])
  })

  it('stays readable: at least 20 CSS pixels across however far out', () => {
    const layout = badgeLayout(statuses(1), 32, 32, r, 0.6)
    expect(layout.radius * 0.6).toBeGreaterThanOrEqual(BADGE_MIN_RADIUS_PX)
  })

  it('slides left to keep clear of the stack badge', () => {
    const free = badgeLayout(statuses(3), 32, 32, r, 1)
    const limit = 32 + r * 0.74 - 10
    const clear = badgeLayout(statuses(3), 32, 32, r, 1, limit)
    expect(clear.slots.at(-1)!.x + clear.radius).toBeLessThanOrEqual(limit + 1e-9)
    expect(clear.slots[0]!.x).toBeLessThan(free.slots[0]!.x)
  })

  it('draws one disc on a token too small for a row: the icon, or how many', () => {
    // 20 px cells: the token's radius is 8.4 px.
    const one = badgeLayout([status('a', 2)], 32, 32, r, 20 / 64)
    expect(one.slots).toEqual([expect.objectContaining({ kind: 'icon' })])
    const many = badgeLayout(statuses(4), 32, 32, r, 20 / 64)
    expect(many.slots).toEqual([expect.objectContaining({ kind: 'count', text: '4' })])
  })
})
