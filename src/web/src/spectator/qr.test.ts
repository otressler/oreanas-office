import { describe, expect, it } from 'vitest'
import { QUIET_ZONE, joinLink, qrImage } from './qr'

describe('qrImage', () => {
  it('draws a square code with a quiet zone', () => {
    const image = qrImage('https://oreanas-office.example/beitreten/KX7PQ2?sitzung=abc')
    // Version 4 or so: 33 modules, plus the quiet zone on both sides.
    expect(image.size).toBeGreaterThan(2 * QUIET_ZONE + 20)
    expect(image.size % 2).toBe(1)
    expect(image.path).toMatch(/^M\d+ \d+h1v1h-1z/)
  })

  it('keeps every dark module inside the code, away from the quiet zone', () => {
    const image = qrImage('https://oreanas-office.example/beitreten/KX7PQ2')
    const cells = [...image.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => [+m[1]!, +m[2]!])
    expect(cells.length).toBeGreaterThan(100)
    for (const [x, y] of cells) {
      expect(x).toBeGreaterThanOrEqual(QUIET_ZONE)
      expect(y).toBeGreaterThanOrEqual(QUIET_ZONE)
      expect(x).toBeLessThan(image.size - QUIET_ZONE)
      expect(y).toBeLessThan(image.size - QUIET_ZONE)
    }
  })

  it('draws the same code for the same text and another for another', () => {
    expect(qrImage('a').path).toBe(qrImage('a').path)
    expect(qrImage('a').path).not.toBe(qrImage('b').path)
  })

  it('has the three finder patterns in its corners', () => {
    const { size, path } = qrImage('https://oreanas-office.example/beitreten/KX7PQ2')
    const dark = new Set([...path.matchAll(/M(\d+) (\d+)h/g)].map((m) => `${m[1]},${m[2]}`))
    const corner = (x: number, y: number) => dark.has(`${x},${y}`)
    // The outer ring of a finder pattern is dark at its corners.
    for (const [x, y] of [
      [QUIET_ZONE, QUIET_ZONE],
      [size - QUIET_ZONE - 1, QUIET_ZONE],
      [QUIET_ZONE, size - QUIET_ZONE - 1],
    ] as const) {
      expect(corner(x, y)).toBe(true)
    }
  })
})

describe('joinLink', () => {
  it('opens the join page, with the session for "Nur zuschauen"', () => {
    expect(joinLink('https://x.example', 'KX7PQ2', 's1')).toBe(
      'https://x.example/beitreten/KX7PQ2?sitzung=s1',
    )
    expect(joinLink('https://x.example', 'KX7PQ2')).toBe('https://x.example/beitreten/KX7PQ2')
  })
})
