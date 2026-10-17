import { describe, expect, it } from 'vitest'
import {
  CHARACTER_RINGS,
  CREATURE_RING,
  mixColor,
  parseHexColor,
  ringColor,
  tokenLetter,
  tokenMarks,
} from './palette'

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

  it('takes a colour the player picked over the default, but never for creatures', () => {
    expect(ringColor({ kind: 'character', colorIndex: 2, color: '#123abc' })).toBe('#123abc')
    expect(ringColor({ kind: 'character', colorIndex: 2, color: null })).toBe(CHARACTER_RINGS[2])
    expect(ringColor({ kind: 'creature', colorIndex: null, color: '#123abc' })).toBe(CREATURE_RING)
  })
})

describe('parseHexColor', () => {
  it('accepts six hex digits with or without the hash, in lower case', () => {
    expect(parseHexColor('#A1B2C3')).toBe('#a1b2c3')
    expect(parseHexColor(' a1b2c3 ')).toBe('#a1b2c3')
  })

  it('rejects anything else', () => {
    for (const text of ['', '#abc', '#a1b2c3d', '#g1b2c3', 'rot', '##a1b2c3']) {
      expect(parseHexColor(text)).toBeNull()
    }
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

describe('tokenMarks', () => {
  it('numbers creatures that share a letter, in the natural order of their labels', () => {
    const creature = (id: string, label: string) => ({ id, kind: 'creature' as const, label })
    const marks = tokenMarks([
      creature('a', 'Skelett 10'),
      creature('b', 'Spinne 1'),
      creature('c', 'Skelett 2'),
      creature('d', 'Oger 1'),
      creature('e', 'Goblin 2'),
      creature('f', 'Goblin 1'),
      // Characters keep their letter: their ring colours tell them apart.
      { id: 'g', kind: 'character' as const, label: 'Sora' },
      { id: 'h', kind: 'character' as const, label: 'Oreana' },
    ])

    expect(Object.fromEntries(marks)).toEqual({
      a: 'S2',
      b: 'S3',
      c: 'S1',
      d: 'O',
      e: 'G2',
      f: 'G1',
      g: 'S',
      h: 'O',
    })
  })
})

describe('mixColor', () => {
  it('blends two colours', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixColor('#000000', '#ff8040', 0.5)).toBe('#804020')
  })
})

describe('tokenMarks with fog', () => {
  const creature = (id: string, label: string) => ({ id, kind: 'creature' as const, label })

  it('keeps the plain letter for a creature without a number (not seen yet)', () => {
    const marks = tokenMarks(
      [creature('a', 'Goblin'), creature('b', 'Goblin'), creature('c', 'Goblin')],
      { fog: true },
    )
    expect([...marks.values()]).toEqual(['G', 'G', 'G'])
  })

  it('numbers only the creatures that have a number, once two share a letter', () => {
    const marks = tokenMarks(
      [creature('a', 'Goblin 2'), creature('b', 'Goblin'), creature('c', 'Goblin 1')],
      { fog: true },
    )
    expect(Object.fromEntries(marks)).toEqual({ a: 'G2', b: 'G', c: 'G1' })
  })

  it('a single numbered creature keeps its letter, and a renamed one too', () => {
    const marks = tokenMarks([creature('a', 'Goblin 3'), creature('b', 'Häuptling')], {
      fog: true,
    })
    expect(Object.fromEntries(marks)).toEqual({ a: 'G', b: 'H' })
  })

  it('without fog the marks stay as before, whether or not the label ends in a number', () => {
    const marks = tokenMarks([creature('a', 'Goblin'), creature('b', 'Goblin')])
    expect(Object.fromEntries(marks)).toEqual({ a: 'G1', b: 'G2' })
  })
})
