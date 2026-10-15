// The crop step's math: the square stays inside the picture at every pan and zoom, a zoom
// keeps the point under the fingers, and the upload is the square on screen.
import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  clampCrop,
  cropSide,
  cropSquare,
  initialCrop,
  panCrop,
  pictureLayout,
  setCropZoom,
  zoomCrop,
} from './crop'

// A landscape phone photo, shown in a 300 px box.
const photo = { width: 4000, height: 3000 }
const BOX = 300

const inside = (square: { x: number; y: number; side: number }) => {
  expect(square.x).toBeGreaterThanOrEqual(0)
  expect(square.y).toBeGreaterThanOrEqual(0)
  expect(square.x + square.side).toBeLessThanOrEqual(photo.width + 1e-9)
  expect(square.y + square.side).toBeLessThanOrEqual(photo.height + 1e-9)
}

describe('crop', () => {
  it('starts with the whole short side in the middle', () => {
    const view = initialCrop(photo)
    expect(cropSquare(photo, view)).toEqual({ x: 500, y: 0, side: 3000 })
    // On screen the picture's short side fills the box exactly.
    expect(pictureLayout(photo, view, BOX)).toEqual({
      left: -50,
      top: 0,
      width: 400,
      height: 300,
    })
  })

  it('pans by screen pixels and never leaves empty space', () => {
    const start = initialCrop(photo)
    // 10 px on screen are 100 picture pixels at this size; dragging right shows more left.
    expect(cropSquare(photo, panCrop(photo, start, 10, 0, BOX)).x).toBeCloseTo(400)
    // Far beyond the edge it stops at the edge, on both axes.
    const far = panCrop(photo, start, 5000, -5000, BOX)
    expect(cropSquare(photo, far)).toEqual({ x: 0, y: 0, side: 3000 })
    inside(cropSquare(photo, panCrop(photo, start, -5000, 5000, BOX)))
  })

  it('zooms around the point under the fingers', () => {
    const start = initialCrop(photo)
    const point = { x: 75, y: 150 }
    const zoomed = zoomCrop(photo, start, 2, point, BOX)
    expect(zoomed.zoom).toBe(2)
    expect(cropSide(photo, zoomed.zoom)).toBe(1500)
    // The picture point under (75, 150) is the same before and after.
    const before = pictureLayout(photo, start, BOX)
    const after = pictureLayout(photo, zoomed, BOX)
    const at = (l: typeof before) => ({
      x: (point.x - l.left) / (l.width / photo.width),
      y: (point.y - l.top) / (l.height / photo.height),
    })
    expect(at(after).x).toBeCloseTo(at(before).x)
    expect(at(after).y).toBeCloseTo(at(before).y)
  })

  it('keeps the zoom between the whole short side and the maximum', () => {
    const start = initialCrop(photo)
    expect(zoomCrop(photo, start, 0.25, { x: 10, y: 10 }, BOX).zoom).toBe(1)
    expect(zoomCrop(photo, start, 100, { x: 10, y: 10 }, BOX).zoom).toBe(MAX_ZOOM)
    expect(setCropZoom(photo, start, 0).zoom).toBe(1)
  })

  it('zooming out near an edge pulls the square back inside', () => {
    const corner = clampCrop(photo, { cx: 0, cy: 0, zoom: 4 })
    expect(cropSquare(photo, corner)).toEqual({ x: 0, y: 0, side: 750 })
    const out = zoomCrop(photo, corner, 0.5, { x: 0, y: 0 }, BOX)
    inside(cropSquare(photo, out))
    expect(cropSquare(photo, out).side).toBe(1500)
  })

  it('ignores gestures before the box has a size', () => {
    const start = initialCrop(photo)
    expect(panCrop(photo, start, 50, 50, 0)).toBe(start)
    expect(zoomCrop(photo, start, 2, { x: 0, y: 0 }, 0)).toBe(start)
  })

  it('works for portrait pictures too', () => {
    const tall = { width: 1080, height: 1920 }
    const view = initialCrop(tall)
    expect(cropSquare(tall, view)).toEqual({ x: 0, y: 420, side: 1080 })
    expect(cropSquare(tall, panCrop(tall, view, 0, -1000, BOX))).toEqual({
      x: 0,
      y: 840,
      side: 1080,
    })
  })
})
