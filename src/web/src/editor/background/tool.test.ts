// The background's handles and calibration on the canvas: each drag is one undo step on the
// map's backgroundPlacement, and only the picked, shown picture can be grabbed.
import { beforeEach, describe, expect, it } from 'vitest'
import { editorStoreFor, pointerAt } from '../testing'
import type { EditorStore } from '../store'
import { version } from './testing'
import { backgroundTool } from '.'
import { calibration, currentPlacement, startCalibration } from './tool'

let store: EditorStore
const picked = version({ x: 0, y: 0, width: 10, height: 8 })

/** A pointer at an exact spot, in cells, at 64 CSS pixels per cell. */
const at = (x: number, y: number, extra = {}) =>
  pointerAt(Math.floor(x), Math.floor(y), { point: { x, y }, ...extra })

beforeEach(() => {
  store = editorStoreFor()
  store.getState().setBackground(picked)
  store.getState().setBackgroundVisible(true)
  backgroundTool.onActivate!({ store })
})

describe('the background tool', () => {
  it('drags the picture as one undo step', () => {
    const ctx = { store }
    backgroundTool.onPointerDown!(at(5, 4), ctx)
    backgroundTool.onPointerMove!(at(6, 4.5), ctx)
    backgroundTool.onPointerMove!(at(7, 5), ctx)
    backgroundTool.onPointerUp!(at(7, 5, { pressed: false }), ctx)

    expect(store.getState().doc.backgroundPlacement).toMatchObject({
      assetId: picked.id,
      x: 2,
      y: 1,
      width: 10,
      height: 8,
    })
    store.getState().undo()
    expect(store.getState().doc.backgroundPlacement).toBeNull()
  })

  it('scales from a corner and leaves the opposite one in place', () => {
    const ctx = { store }
    backgroundTool.onPointerDown!(at(10, 8), ctx)
    backgroundTool.onPointerMove!(at(15, 12), ctx)
    backgroundTool.onPointerUp!(at(15, 12, { pressed: false }), ctx)

    const placement = store.getState().doc.backgroundPlacement!
    expect(placement.x).toBeCloseTo(0)
    expect(placement.y).toBeCloseTo(0)
    expect(placement.width).toBeCloseTo(15)
    expect(placement.height).toBeCloseTo(12)
  })

  it('leaves a hidden picture alone', () => {
    store.getState().setBackgroundVisible(false)
    backgroundTool.onPointerDown!(at(5, 4), { store })
    backgroundTool.onPointerMove!(at(7, 5), { store })
    backgroundTool.onPointerUp!(at(7, 5, { pressed: false }), { store })

    expect(currentPlacement(store.getState())).toBeNull()
    expect(store.getState().doc.backgroundPlacement).toBeNull()
  })

  it('draws its frame through the overlay while active', () => {
    expect(store.getState().overlay).toEqual([expect.objectContaining({ kind: 'custom' })])
  })

  it('calibrates from four clicks: picture spot, map corner, picture spot, map corner', () => {
    const ctx = { store }
    startCalibration(store)
    backgroundTool.onPointerDown!(at(1, 1), ctx)
    backgroundTool.onPointerDown!(at(2.2, 2.9), ctx) // snaps to (2, 3)
    backgroundTool.onPointerDown!(at(3, 1), ctx)
    expect(calibration.getState().points).toHaveLength(3)
    backgroundTool.onPointerDown!(at(6.1, 2.8), ctx) // snaps to (6, 3)

    // Two picture cells become two map cells: twice as large, shifted.
    const placement = store.getState().doc.backgroundPlacement!
    expect(placement.width).toBeCloseTo(20)
    expect(placement.height).toBeCloseTo(16)
    expect(placement.rotation).toBeCloseTo(0)
    expect(placement.x).toBeCloseTo(0)
    expect(placement.y).toBeCloseTo(1)
    expect(calibration.getState()).toMatchObject({ active: false, points: [], failed: false })
  })

  it('says so when the calibration spots lie too close together', () => {
    const ctx = { store }
    startCalibration(store)
    for (const spot of [at(1, 1), at(2, 2), at(1.01, 1), at(4, 2)])
      backgroundTool.onPointerDown!(spot, ctx)

    expect(store.getState().doc.backgroundPlacement).toBeNull()
    expect(calibration.getState()).toMatchObject({ active: false, failed: true })
  })
})
