import { describe, expect, it } from 'vitest'
import {
  CELL,
  MAX_CELL_PX,
  clampPan,
  clampViewport,
  fitViewport,
  keepCentre,
  screenToCell,
  screenToWorld,
  worldSize,
  worldToScreen,
  zoomAt,
  zoomLimits,
} from './viewport'

const phone = { width: 412, height: 780 }
const field = worldSize(40, 38)

describe('fitViewport', () => {
  it('fits the whole map with padding and centres it', () => {
    const view = fitViewport(field, phone, 12)
    // The width is the tight side: (412 - 24) px for 40 cells.
    expect(view.scale * CELL).toBeCloseTo(388 / 40)
    expect(view.x).toBeCloseTo(12)
    const mapHeight = field.height * view.scale
    expect(view.y).toBeCloseTo((780 - mapHeight) / 2)
  })

  it('uses the height when the screen is wide', () => {
    const view = fitViewport(worldSize(20, 12), { width: 1280, height: 720 }, 12)
    expect(view.scale * CELL).toBeCloseTo(696 / 12)
  })
})

describe('zoomLimits', () => {
  it('goes from half the fit out to a large cell', () => {
    const limits = zoomLimits(field, phone)
    expect(limits.min).toBeCloseTo(fitViewport(field, phone).scale / 2)
    expect(limits.max * CELL).toBe(MAX_CELL_PX)
  })

  it('never makes the fit itself impossible on a tiny map', () => {
    const tiny = worldSize(1, 1)
    const limits = zoomLimits(tiny, { width: 1280, height: 720 })
    expect(limits.max).toBeCloseTo(fitViewport(tiny, { width: 1280, height: 720 }).scale)
  })
})

describe('zoomAt', () => {
  const limits = { min: 0.1, max: 10 }

  it('keeps the world point under the focus in place', () => {
    const view = { scale: 0.5, x: 30, y: -20 }
    const focus = { x: 200, y: 300 }
    const before = screenToWorld(view, focus)
    const zoomed = zoomAt(view, focus, 1.7, limits)
    expect(zoomed.scale).toBeCloseTo(0.85)
    const after = worldToScreen(zoomed, before)
    expect(after.x).toBeCloseTo(focus.x)
    expect(after.y).toBeCloseTo(focus.y)
  })

  it('stops at the limits and still keeps the focus', () => {
    const view = { scale: 8, x: 0, y: 0 }
    const zoomed = zoomAt(view, { x: 100, y: 100 }, 4, limits)
    expect(zoomed.scale).toBe(10)
    expect(screenToWorld(zoomed, { x: 100, y: 100 }).x).toBeCloseTo(12.5)
    expect(zoomAt(view, { x: 0, y: 0 }, 0.001, limits).scale).toBe(0.1)
  })
})

describe('clampPan', () => {
  it('keeps the map over the middle of the screen', () => {
    const view = { scale: 1, x: 5000, y: -9000 }
    const clamped = clampPan(view, field, phone)
    // The left edge may come in to the middle; the bottom edge may rise to the middle.
    expect(clamped.x).toBe(phone.width / 2)
    expect(clamped.y + field.height).toBe(phone.height / 2)
  })

  it('leaves a view that shows the middle alone', () => {
    const view = fitViewport(field, phone)
    expect(clampPan(view, field, phone)).toEqual(view)
  })
})

describe('clampViewport and keepCentre', () => {
  it('clamps the scale into the limits', () => {
    const clamped = clampViewport({ scale: 100, x: 0, y: 0 }, field, phone)
    expect(clamped.scale * CELL).toBeCloseTo(MAX_CELL_PX)
  })

  it('keeps the same world point in the middle after a rotation', () => {
    const view = { scale: 1, x: -300, y: -400 }
    const landscape = { width: 780, height: 412 }
    const centre = screenToWorld(view, { x: phone.width / 2, y: phone.height / 2 })
    const turned = keepCentre(view, phone, landscape, field)
    const after = screenToWorld(turned, { x: landscape.width / 2, y: landscape.height / 2 })
    expect(turned.scale).toBe(1)
    expect(after.x).toBeCloseTo(centre.x)
    expect(after.y).toBeCloseTo(centre.y)
  })
})

describe('screenToCell', () => {
  it('finds the cell under a point, also outside the map', () => {
    const view = { scale: 0.5, x: 10, y: 20 }
    // One cell is 32 px here, starting at (10, 20).
    expect(screenToCell(view, { x: 10, y: 20 })).toEqual({ x: 0, y: 0 })
    expect(screenToCell(view, { x: 41.9, y: 51.9 })).toEqual({ x: 0, y: 0 })
    expect(screenToCell(view, { x: 42, y: 52 })).toEqual({ x: 1, y: 1 })
    expect(screenToCell(view, { x: 5, y: 10 })).toEqual({ x: -1, y: -1 })
  })
})
