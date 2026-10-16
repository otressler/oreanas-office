// Token images on the board: an image token draws its picture inside the ring and moves a
// creature's number to a badge; without a loaded image it keeps its letter.
import { describe, expect, it } from 'vitest'
import type { BoardToken } from '../api/types'
import { drawTokens, markNumber } from './render'

/** A 2D context that records the calls the token drawing makes. */
function recordingContext() {
  const calls: { name: string; args: unknown[] }[] = []
  const state: Record<string | symbol, unknown> = {}
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key]
      if (key === 'measureText') return () => ({ width: 0 })
      return (...args: unknown[]) => {
        calls.push({ name: String(key), args })
      }
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  const texts = () => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])
  const images = () => calls.filter((c) => c.name === 'drawImage')
  return { ctx, calls, texts, images }
}

const token = (fields: Partial<BoardToken>): BoardToken => ({
  id: 't1',
  kind: 'creature',
  characterId: null,
  creatureTypeId: 'goblin',
  ownerUserId: null,
  label: 'Goblin 1',
  x: 2,
  y: 3,
  elevation: 0,
  size: 'medium',
  colorIndex: null,
  version: 0,
  imageUrl: null,
  color: null,
  statuses: [],
  ...fields,
})

const picture = { width: 1024, height: 1024 } as unknown as CanvasImageSource
const images = new Map([['/api/assets/goblin', picture]])

describe('drawing token images', () => {
  it('draws the letter mark without an image', () => {
    const { ctx, texts, images: drawn } = recordingContext()
    drawTokens(ctx, [token({})], { cssScale: 1, marks: new Map([['t1', 'G1']]) })
    expect(texts()).toEqual(['G1'])
    expect(drawn()).toEqual([])
  })

  it('keeps the letter while the image has not loaded', () => {
    const { ctx, texts, images: drawn } = recordingContext()
    drawTokens(ctx, [token({ imageUrl: '/api/assets/other' })], {
      cssScale: 1,
      marks: new Map([['t1', 'G']]),
      images,
    })
    expect(texts()).toEqual(['G'])
    expect(drawn()).toEqual([])
  })

  it('draws the image clipped to the circle, with the number as a badge', () => {
    const { ctx, calls, texts, images: drawn } = recordingContext()
    drawTokens(ctx, [token({ imageUrl: '/api/assets/goblin' })], {
      cssScale: 1,
      marks: new Map([['t1', 'G12']]),
      images,
    })
    expect(drawn()).toHaveLength(1)
    // The whole square picture into the circle's square around the token's middle.
    const [image, sx, sy, sw, sh, dx, dy, dw, dh] = drawn()[0]!.args as number[]
    expect(image).toBe(picture)
    expect([sx, sy, sw, sh]).toEqual([0, 0, 1024, 1024])
    expect(dx! + dw! / 2).toBeCloseTo(2.5 * 64)
    expect(dy! + dh! / 2).toBeCloseTo(3.5 * 64)
    // Clipped first, and the ring is drawn over the picture's edge.
    const clip = calls.findIndex((c) => c.name === 'clip')
    const draw = calls.findIndex((c) => c.name === 'drawImage')
    expect(clip).toBeGreaterThanOrEqual(0)
    expect(clip).toBeLessThan(draw)
    expect(calls.slice(draw).some((c) => c.name === 'stroke')).toBe(true)
    // No letter in the middle; the number sits on the edge.
    expect(texts()).toEqual(['12'])
  })

  it('draws no badge for a plain letter, e.g. a character', () => {
    const { ctx, texts, images: drawn } = recordingContext()
    drawTokens(
      ctx,
      [token({ kind: 'character', label: 'Brom', imageUrl: '/api/assets/goblin', colorIndex: 0 })],
      { cssScale: 1, marks: new Map([['t1', 'B']]), images },
    )
    expect(drawn()).toHaveLength(1)
    expect(texts()).toEqual([])
  })

  it('draws a far-zoomed-out token as a dot, without its image', () => {
    const { ctx, images: drawn } = recordingContext()
    drawTokens(ctx, [token({ imageUrl: '/api/assets/goblin' })], { cssScale: 0.05, images })
    expect(drawn()).toEqual([])
  })

  it('reads the number of a numbered mark', () => {
    expect(markNumber('G1')).toBe('1')
    expect(markNumber('S12')).toBe('12')
    expect(markNumber('G')).toBeNull()
  })
})
