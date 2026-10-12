import { describe, expect, it } from 'vitest'
import { CHARACTER_RINGS, CREATURE_RING, mixColor, ringColor, tokenLetter } from './palette'

describe('ringColor', () => {
  it('gives creatures the red ring', () => {
    expect(ringColor({ kind: 'creature', colorIndex: null })).toBe(CREATURE_RING)
    expect(ringColor({ kind: 'creature', colorIndex: 3 })).toBe(CREATURE_RING)
  })

  it('picks characters’ rings by colorIndex, wrapping around', () => {
    expect(CHARACTER_RINGS).toHaveLength(8)
    expect(new Set(CHARACTER_RINGS).size).toBe(8)
    expect(CHARACTER_RINGS).not.toContain(CREATURE_RING)
    expect(ringColor({ kind: 'character', colorIndex: 2 })).toBe(CHARACTER_RINGS[2])
    expect(ringColor({ kind: 'character', colorIndex: 10 })).toBe(CHARACTER_RINGS[2])
    expect(ringColor({ kind: 'character', colorIndex: -1 })).toBe(CHARACTER_RINGS[7])
    expect(ringColor({ kind: 'character', colorIndex: null })).toBe(CHARACTER_RINGS[0])
  })
})

describe('tokenLetter', () => {
  it('takes the first letter of the label in upper case', () => {
    expect(tokenLetter('Goblin 3')).toBe('G')
    expect(tokenLetter('  oreana')).toBe('O')
    expect(tokenLetter('Ünal')).toBe('Ü')
    expect(tokenLetter('')).toBe('?')
  })
})

describe('mixColor', () => {
  it('blends two colours', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixColor('#000000', '#ff8040', 0.5)).toBe('#804020')
  })
})
