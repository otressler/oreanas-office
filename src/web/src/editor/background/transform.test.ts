import { describe, expect, it } from 'vitest'
import type { BackgroundPlacement } from '../../api/types'
import {
  calibrated,
  cornersOf,
  grabAt,
  moved,
  nearestCorner,
  normaliseAngle,
  rotated,
  rotateHandleOf,
  scaled,
  shifted,
  toLocal,
  toMap,
} from './transform'

const base: BackgroundPlacement = { assetId: 'a', x: 0, y: 0, width: 8, height: 4, rotation: 0 }

function close(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6)
  expect(actual.y).toBeCloseTo(expected.y, 6)
}

describe('placement geometry', () => {
  it('turns spots into the picture frame and back', () => {
    const turned = { ...base, rotation: 30 }
    const spot = { x: 5.5, y: 3.25 }
    close(toMap(turned, toLocal(turned, spot)), spot)
  })

  it('turns the corners clockwise around the centre', () => {
    const corners = cornersOf({ ...base, rotation: 90 })
    // A quarter turn clockwise: the top left corner goes to the top right of the centre.
    close(corners[0]!, { x: 6, y: -2 })
    close(corners[2]!, { x: 2, y: 6 })
  })

  it('grabs the turn handle, a corner, the picture or nothing', () => {
    const cellPx = 64
    expect(grabAt(base, rotateHandleOf(base, cellPx), cellPx)).toEqual({ kind: 'rotate' })
    expect(grabAt(base, { x: 8.05, y: 4 }, cellPx)).toEqual({ kind: 'corner', index: 2 })
    expect(grabAt(base, { x: 3, y: 2 }, cellPx)).toEqual({ kind: 'move' })
    expect(grabAt(base, { x: 12, y: 2 }, cellPx)).toBeNull()
  })

  it('keeps angles in (-180, 180]', () => {
    expect(normaliseAngle(190)).toBe(-170)
    expect(normaliseAngle(-180)).toBe(180)
    expect(normaliseAngle(45)).toBe(45)
  })
})

describe('dragging', () => {
  it('moves by the way the pointer went', () => {
    expect(moved(base, { x: 1, y: 1 }, { x: 2.5, y: 0.75 })).toMatchObject({ x: 1.5, y: -0.25 })
  })

  it('turns by the swept angle, catching right angles and stepping with Shift', () => {
    const c = { x: 4, y: 2 }
    const from = { x: c.x + 2, y: c.y }
    const at = (deg: number) => ({
      x: c.x + 2 * Math.cos((deg * Math.PI) / 180),
      y: c.y + 2 * Math.sin((deg * Math.PI) / 180),
    })
    expect(rotated(base, from, at(10), false).rotation).toBeCloseTo(10)
    expect(rotated(base, from, at(89), false).rotation).toBe(90)
    expect(rotated(base, from, at(37), true).rotation).toBe(30)
  })

  it('scales from a corner around the opposite one, keeping the aspect', () => {
    // Dragging the bottom right corner from (8, 4) to (12, 5): the top left corner stays.
    const result = scaled(base, 2, { x: 12, y: 5 })
    close(result, { x: 0, y: 0 })
    expect(result.width / result.height).toBeCloseTo(2)
    expect(result.width).toBeGreaterThan(8)
  })

  it('keeps the opposite corner of a turned picture', () => {
    const turned = { ...base, rotation: 30 }
    const anchor = cornersOf(turned)[0]!
    const result = scaled(turned, 2, { x: 20, y: 20 })
    close(cornersOf(result)[0]!, anchor)
  })

  it('never scales below the smallest edge', () => {
    const result = scaled(base, 2, { x: -10, y: -10 })
    expect(Math.min(result.width, result.height)).toBeCloseTo(0.25)
  })
})

describe('calibration', () => {
  it('maps two picture spots onto two grid corners', () => {
    // The picture's own grid has 1.6-cell squares, turned 90° and offset.
    const placement = { ...base, rotation: 0 }
    const from: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 1, y: 1 },
      { x: 2.6, y: 1 },
    ]
    const to: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 3, y: 3 },
      { x: 3, y: 4 },
    ]
    const result = calibrated(placement, from, to)!
    expect(result.rotation).toBeCloseTo(90)
    expect(result.width).toBeCloseTo(8 / 1.6)
    // Both picture spots, followed through the new placement, land on their corners.
    for (const [i, spot] of from.entries()) {
      const local = toLocal(placement, spot)
      const scale = result.width / placement.width
      close(toMap(result, { x: local.x * scale, y: local.y * scale }), to[i]!)
    }
  })

  it('refuses spots too close together', () => {
    expect(
      calibrated(
        base,
        [
          { x: 1, y: 1 },
          { x: 1.01, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      ),
    ).toBeNull()
    expect(
      calibrated(
        base,
        [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
        ],
        [
          { x: 2, y: 2 },
          { x: 2, y: 2 },
        ],
      ),
    ).toBeNull()
  })

  it('snaps map spots to the nearest grid corner', () => {
    expect(nearestCorner({ x: 2.4, y: 5.6 })).toEqual({ x: 2, y: 6 })
  })
})

describe('resizing', () => {
  it('shifts with rows and columns added or removed at the left and top', () => {
    expect(shifted(base, 2, -1)).toMatchObject({ x: 2, y: -1, width: 8, height: 4 })
    expect(shifted(base, 0, 0)).toBe(base)
  })
})
