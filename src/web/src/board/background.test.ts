// The background picture's drawing decisions and frame math. The pixels themselves are
// checked by eye in the board lab and the manual gate; jsdom has no canvas.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  drawPicture,
  forgetLoadedPictures,
  mapLayers,
  mapRect,
  pictureRect,
  useBackgroundImage,
} from './background'
import { drawGrid } from './render'
import { buildScene } from './scene'
import { CELL } from './viewport'

/** A 2D context that records the calls made on it. */
function recordingContext(transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) {
  const calls: { name: string; args: unknown[] }[] = []
  const styles: string[] = []
  const target = {
    canvas: { width: 2000, height: 2000 },
    getTransform: () => transform,
  }
  const ctx = new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key as keyof typeof object]
      return (...args: unknown[]) => calls.push({ name: String(key), args })
    },
    set(_, key, value) {
      if (key === 'strokeStyle') styles.push(String(value))
      return true
    },
  })
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    styles,
    named: (name: string) => calls.filter((c) => c.name === name),
  }
}

describe('map layers', () => {
  it('draws the plain rendering and labels without a loaded picture', () => {
    expect(mapLayers(false)).toEqual({
      picture: false,
      plain: true,
      highlight: true,
      grid: true,
      labels: true,
    })
  })

  it('draws only the picture, highlight and grid with one', () => {
    expect(mapLayers(true)).toEqual({
      picture: true,
      plain: false,
      highlight: true,
      grid: true,
      labels: false,
    })
  })
})

describe('frame math', () => {
  it('turns a frame in cells into world units', () => {
    expect(pictureRect({ x: 0, y: 0, width: 20, height: 12 })).toEqual({
      x: 0,
      y: 0,
      width: 20 * CELL,
      height: 12 * CELL,
    })
    // A 30 × 4 map padded to 30 × 10: the picture starts three cells above the map.
    expect(pictureRect({ x: 0, y: -3, width: 30, height: 10 })).toEqual({
      x: 0,
      y: -3 * CELL,
      width: 30 * CELL,
      height: 10 * CELL,
    })
    expect(mapRect(30, 4)).toEqual({ x: 0, y: 0, width: 30 * CELL, height: 4 * CELL })
  })

  it('draws the picture at its frame, clipped to the map', () => {
    const { ctx, calls, named } = recordingContext()
    const image = {} as CanvasImageSource
    drawPicture(ctx, image, { x: 0, y: -3, width: 30, height: 10 }, 30, 4)
    expect(named('rect')[0]!.args).toEqual([0, 0, 30 * CELL, 4 * CELL])
    // Drawn around its centre, so a turn turns it in place.
    expect(named('translate')[0]!.args).toEqual([15 * CELL, 2 * CELL])
    expect(named('rotate')).toHaveLength(0)
    expect(named('drawImage')[0]!.args).toEqual([
      image,
      -15 * CELL,
      -5 * CELL,
      30 * CELL,
      10 * CELL,
    ])
    const order = calls.map((c) => c.name)
    expect(order.indexOf('clip')).toBeLessThan(order.indexOf('drawImage'))
    expect(order.at(-1)).toBe('restore')
  })

  it('turns the picture around its centre, and draws it whole without the clip', () => {
    const { ctx, named } = recordingContext()
    const image = {} as CanvasImageSource
    drawPicture(ctx, image, { x: 1, y: 1, width: 4, height: 2, rotation: 90 }, 6, 4, {
      clip: false,
    })
    expect(named('clip')).toHaveLength(0)
    expect(named('translate')[0]!.args).toEqual([3 * CELL, 2 * CELL])
    expect(named('rotate')[0]!.args[0]).toBeCloseTo(Math.PI / 2)
  })
})

describe('the grid over a picture', () => {
  const scene = buildScene({
    width: 2,
    height: 1,
    layout: {
      schemaVersion: 1,
      cells: [
        { x: 0, y: 0, terrain: 'floor', elevation: 0 },
        { x: 1, y: 0, terrain: 'floor', elevation: 0 },
      ],
      features: [],
      entrances: [],
    },
  })

  it('strokes once on the plain rendering and twice, dark and light, on a picture', () => {
    const plain = recordingContext()
    drawGrid(plain.ctx, scene, 1)
    expect(plain.named('stroke')).toHaveLength(1)

    const onPicture = recordingContext()
    drawGrid(onPicture.ctx, scene, 1, { onPicture: true })
    expect(onPicture.named('stroke')).toHaveLength(2)
    expect(onPicture.styles[0]).toMatch(/^rgba\(10, 11, 14/)
    expect(onPicture.styles[1]).toMatch(/^rgba\(236, 230, 216/)
  })
})

describe('loading the picture', () => {
  class FakeImage {
    static made: FakeImage[] = []
    src = ''
    decoding = ''
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      FakeImage.made.push(this)
    }
  }

  beforeEach(() => {
    FakeImage.made = []
    forgetLoadedPictures()
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => forgetLoadedPictures())

  it('is null without a url and while loading, then the image', () => {
    const { result, rerender } = renderHook(({ url }) => useBackgroundImage(url), {
      initialProps: { url: null as string | null },
    })
    expect(result.current).toBeNull()
    expect(FakeImage.made).toHaveLength(0)

    rerender({ url: '/api/assets/a' })
    expect(result.current).toBeNull()
    const image = FakeImage.made[0]!
    expect(image).toMatchObject({ src: '/api/assets/a', decoding: 'async' })
    act(() => image.onload!())
    expect(result.current).toBe(image)

    // Shown again at once later: images never change.
    const again = renderHook(() => useBackgroundImage('/api/assets/a'))
    expect(again.result.current).toBe(image)
    expect(FakeImage.made).toHaveLength(1)
  })

  it('stays null when the picture fails, so the plain rendering stays', () => {
    const { result } = renderHook(() => useBackgroundImage('/api/assets/broken'))
    act(() => FakeImage.made[0]!.onerror!())
    expect(result.current).toBeNull()
  })
})
