import { describe, expect, it } from 'vitest'
import {
  COMFORTABLE_CELL_PX,
  centredOn,
  edgeMarker,
  keptInView,
  panTo,
  uncoveredArea,
} from './overlay'
import { CELL } from './viewport'

const screen = { width: 400, height: 800 }

describe('uncoveredArea', () => {
  it('is the board minus the covered strips', () => {
    expect(uncoveredArea(screen, undefined)).toEqual({ left: 0, top: 0, right: 400, bottom: 800 })
    expect(uncoveredArea(screen, { bottom: 200, right: 30, top: 10 })).toEqual({
      left: 0,
      top: 10,
      right: 370,
      bottom: 600,
    })
  })

  it('never ends up empty', () => {
    const area = uncoveredArea(screen, { top: 500, bottom: 500 })
    expect(area.bottom).toBeGreaterThan(area.top)
  })
})

describe('edgeMarker', () => {
  const area = uncoveredArea(screen, { bottom: 200 })

  it('shows nothing for a ping in view', () => {
    expect(edgeMarker({ x: 200, y: 300 }, area)).toBeNull()
  })

  it('sits at the edge towards a ping off to the right, pointing at it', () => {
    const marker = edgeMarker({ x: 1000, y: 300 }, area, 20)!
    expect(marker.x).toBeCloseTo(380)
    expect(marker.y).toBeCloseTo(300)
    expect(marker.angle).toBeCloseTo(0)
  })

  it('keeps clear of the covered strip at the bottom', () => {
    // Under the docked card: out of view, so the marker sits above the card.
    const marker = edgeMarker({ x: 200, y: 700 }, area, 20)!
    expect(marker.y).toBeCloseTo(580)
    expect(marker.angle).toBeCloseTo(Math.PI / 2)
  })

  it('goes into the corner on a diagonal', () => {
    const marker = edgeMarker(
      { x: -2000, y: -2000 },
      uncoveredArea({ width: 400, height: 400 }, {}),
      20,
    )!
    expect(marker.x).toBeCloseTo(20)
    expect(marker.y).toBeCloseTo(20)
  })

  it('counts an arrow as seen while either end is in view', () => {
    const tail = { x: 100, y: 100 }
    const head = { x: 900, y: 100 }
    const middle = { x: 500, y: 100 }
    expect(edgeMarker(middle, area, 20, [tail, head])).toBeNull()
    expect(edgeMarker(middle, area, 20, [{ x: 600, y: 100 }, head])).not.toBeNull()
  })
})

describe('panTo', () => {
  it('puts the point in the middle of the area at the same zoom', () => {
    const area = uncoveredArea(screen, { bottom: 200 })
    const view = panTo({ scale: 2, x: 0, y: 0 }, { x: 100, y: 50 }, area)
    expect(view).toEqual({ scale: 2, x: 0, y: 200 })
  })
})

describe('centredOn', () => {
  const area = uncoveredArea(screen, {})

  it('centres a token without zooming when it is large enough', () => {
    const view = centredOn(
      { scale: 1, x: 0, y: 0 },
      { x: 10 * CELL, y: 4 * CELL, size: 1 },
      area,
      0.2,
      2.5,
    )
    expect(view.scale).toBe(1)
    // The token's middle at the area's middle.
    expect(10.5 * CELL * view.scale + view.x).toBeCloseTo(200)
    expect(4.5 * CELL * view.scale + view.y).toBeCloseTo(400)
  })

  it('zooms in when the token is smaller than a fingertip', () => {
    const view = centredOn({ scale: 0.2, x: 0, y: 0 }, { x: 0, y: 0, size: 1 }, area, 0.25, 2.5)
    expect(view.scale).toBeCloseTo(COMFORTABLE_CELL_PX / CELL)
    // To the opening zoom when that is closer.
    expect(
      centredOn({ scale: 0.2, x: 0, y: 0 }, { x: 0, y: 0, size: 1 }, area, 1.2, 2.5).scale,
    ).toBe(1.2)
    // Never past the closest zoom.
    expect(centredOn({ scale: 0.2, x: 0, y: 0 }, { x: 0, y: 0, size: 1 }, area, 3, 2.5).scale).toBe(
      2.5,
    )
  })

  it('counts a large token’s whole footprint', () => {
    // Two cells at 0.3: 38 px, a fingertip.
    expect(
      centredOn({ scale: 0.3, x: 0, y: 0 }, { x: 0, y: 0, size: 2 }, area, 0.2, 2.5).scale,
    ).toBe(0.3)
  })
})

describe('keptInView', () => {
  const area = uncoveredArea(screen, { bottom: 200 })

  it('leaves a token alone that is in the uncovered area', () => {
    expect(keptInView({ scale: 1, x: 0, y: 0 }, { x: 64, y: 64, size: 1 }, area, screen)).toBeNull()
  })

  it('pans just enough to bring a token out from under the card', () => {
    // The token spans 620–684 px: under the card that starts at 600.
    const view = keptInView({ scale: 1, x: 0, y: 0 }, { x: 64, y: 620, size: 1 }, area, screen, 8)!
    expect(view).toEqual({ scale: 1, x: 0, y: -92 })
  })

  it('pans a token half off the side back in', () => {
    const view = keptInView({ scale: 1, x: 0, y: 0 }, { x: -32, y: 64, size: 1 }, area, screen, 8)!
    expect(view.x).toBe(40)
  })

  it('leaves a token alone that was panned off the screen on purpose', () => {
    expect(
      keptInView({ scale: 1, x: 0, y: 0 }, { x: 0, y: 2000, size: 1 }, area, screen),
    ).toBeNull()
  })
})
