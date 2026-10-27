import { describe, expect, it } from 'vitest'
import { damageShare, maxValid, parseHitPoints } from './hitPoints'

describe('parseHitPoints', () => {
  it('takes what is left and the maximum', () => {
    expect(parseHitPoints('7', '12')).toEqual({ hitPoints: 7, maxHitPoints: 12 })
    expect(parseHitPoints(' 0 ', '12')).toEqual({ hitPoints: 0, maxHitPoints: 12 })
  })

  it('reads an empty "left" as full', () => {
    expect(parseHitPoints('', '12')).toEqual({ hitPoints: 12, maxHitPoints: 12 })
  })

  it('refuses values out of range or not whole', () => {
    expect(parseHitPoints('13', '12')).toBeNull()
    expect(parseHitPoints('-1', '12')).toBeNull()
    expect(parseHitPoints('2.5', '12')).toBeNull()
    expect(parseHitPoints('5', '')).toBeNull()
    expect(parseHitPoints('5', '0')).toBeNull()
    expect(parseHitPoints('5', '1000')).toBeNull()
  })
})

describe('maxValid', () => {
  it('allows whole numbers from 1 to 999', () => {
    expect([1, 999].map(maxValid)).toEqual([true, true])
    expect([0, 1000, 1.5, Number.NaN].map(maxValid)).toEqual([false, false, false, false])
  })
})

describe('damageShare', () => {
  it('is how much of the maximum is gone', () => {
    expect(damageShare({ hitPoints: 12, maxHitPoints: 12 })).toBe(0)
    expect(damageShare({ hitPoints: 3, maxHitPoints: 12 })).toBe(0.75)
    expect(damageShare({ hitPoints: 0, maxHitPoints: 12 })).toBe(1)
  })

  it('is null without hit points, as on every board but the session DM’s', () => {
    expect(damageShare({ hitPoints: null, maxHitPoints: null })).toBeNull()
    expect(damageShare({})).toBeNull()
  })
})
