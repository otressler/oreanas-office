import { describe, expect, it } from 'vitest'
import { GestureTracker, TAP_MAX_MS, wheelZoomFactor, type PointerKind } from './gestures'

const at = (id: number, x: number, y: number, time = 0, kind: PointerKind = 'touch') => ({
  id,
  x,
  y,
  time,
  kind,
})

describe('GestureTracker', () => {
  it('reports a short press without movement as a tap where it went down', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 100, 100, 0))
    expect(tracker.move(at(1, 104, 103, 50))).toBeNull()
    expect(tracker.up(at(1, 104, 103, 120))).toEqual({ type: 'tap', point: { x: 100, y: 100 } })
  })

  it('pans once the finger leaves the slop, by the whole way so far', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 100, 100))
    expect(tracker.move(at(1, 106, 100))).toBeNull()
    expect(tracker.move(at(1, 120, 110))).toEqual({ type: 'pan', dx: 20, dy: 10 })
    expect(tracker.move(at(1, 125, 108))).toEqual({ type: 'pan', dx: 5, dy: -2 })
    // The end of a pan is never a tap, even back at the start.
    tracker.move(at(1, 100, 100))
    expect(tracker.up(at(1, 100, 100, 100))).toBeNull()
  })

  it('uses a smaller slop for the mouse', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 0, 0, 0, 'mouse'))
    expect(tracker.move(at(1, 6, 0, 10, 'mouse'))).toEqual({ type: 'pan', dx: 6, dy: 0 })
  })

  it('does not count a long press as a tap', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 50, 50, 1000))
    expect(tracker.up(at(1, 50, 50, 1000 + TAP_MAX_MS + 1))).toBeNull()
  })

  it('pinches around the fingers’ midpoint', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 100, 100))
    tracker.down(at(2, 200, 100))
    // The second finger moves out: spread 100 → 150, midpoint 150 → 175.
    expect(tracker.move(at(2, 250, 100))).toEqual({
      type: 'pinch',
      center: { x: 150, y: 100 },
      factor: 1.5,
      dx: 25,
      dy: 0,
    })
  })

  it('never taps after a pinch, and pans with the finger that stays', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 100, 100, 0))
    tracker.down(at(2, 102, 100, 10))
    expect(tracker.up(at(2, 102, 100, 50))).toBeNull()
    expect(tracker.move(at(1, 103, 100, 60))).toEqual({ type: 'pan', dx: 3, dy: 0 })
    expect(tracker.up(at(1, 103, 100, 80))).toBeNull()
    expect(tracker.active).toBe(false)
  })

  it('does not tap after a cancelled pointer', () => {
    const tracker = new GestureTracker()
    tracker.down(at(1, 10, 10))
    tracker.cancel(1)
    expect(tracker.up(at(1, 10, 10, 20))).toBeNull()
    // The next press starts fresh.
    tracker.down(at(3, 10, 10, 100))
    expect(tracker.up(at(3, 10, 10, 150))).toEqual({ type: 'tap', point: { x: 10, y: 10 } })
  })

  it('ignores moves of pointers it never saw go down', () => {
    const tracker = new GestureTracker()
    expect(tracker.move(at(7, 10, 10))).toBeNull()
    expect(tracker.up(at(7, 10, 10))).toBeNull()
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1.15)
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(0.87)
    expect(wheelZoomFactor(-100, 0, false) * wheelZoomFactor(100, 0, false)).toBeCloseTo(1)
  })

  it('treats line deltas like pixels and trackpad pinches as faster', () => {
    expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-48, 0, false))
    expect(wheelZoomFactor(-5, 0, true)).toBeCloseTo(wheelZoomFactor(-25, 0, false))
  })

  it('limits one event to a factor of e', () => {
    expect(wheelZoomFactor(-100000, 0, false)).toBeCloseTo(Math.E)
  })
})
