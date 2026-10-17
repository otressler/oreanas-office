import { describe, expect, it } from 'vitest'
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  GestureTracker,
  TAP_MAX_MS,
  wheelZoomFactor,
  type PointerKind,
} from './gestures'

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

describe('GestureTracker double taps', () => {
  const doubleTapper = () => new GestureTracker({ doubleTap: true })

  /** A first tap at (100, 100), released at time 100. */
  function firstTap(tracker: GestureTracker, kind: PointerKind = 'touch') {
    expect(tracker.down(at(1, 100, 100, 0, kind))).toBeNull()
    expect(tracker.up(at(1, 100, 100, 100, kind))).toEqual({
      type: 'tap',
      point: { x: 100, y: 100 },
    })
  }

  it('reports the first tap at once, takes it back on the second touch, then pings', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    expect(tracker.down(at(2, 110, 108, 100 + DOUBLE_TAP_MS))).toEqual({ type: 'takeBack' })
    expect(tracker.move(at(2, 113, 110, 450))).toBeNull()
    // At the first tap's point, wherever the second touch landed.
    expect(tracker.up(at(2, 113, 110, 480))).toEqual({
      type: 'doubleTap',
      point: { x: 100, y: 100 },
    })
    expect(tracker.active).toBe(false)
  })

  it('works the same with a mouse double click', () => {
    const tracker = doubleTapper()
    firstTap(tracker, 'mouse')
    expect(tracker.down(at(2, 101, 100, 200, 'mouse'))).toEqual({ type: 'takeBack' })
    expect(tracker.up(at(2, 101, 100, 260, 'mouse'))).toEqual({
      type: 'doubleTap',
      point: { x: 100, y: 100 },
    })
  })

  it('draws an arrow when the second touch drags, and never pans meanwhile', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    expect(tracker.down(at(2, 100, 100, 200))).toEqual({ type: 'takeBack' })
    // Within the tap slop nothing happens yet.
    expect(tracker.move(at(2, 105, 100, 220))).toBeNull()
    expect(tracker.move(at(2, 160, 130, 260))).toEqual({
      type: 'arrow',
      from: { x: 100, y: 100 },
      to: { x: 160, y: 130 },
      done: false,
    })
    expect(tracker.move(at(2, 240, 180, 300))).toEqual({
      type: 'arrow',
      from: { x: 100, y: 100 },
      to: { x: 240, y: 180 },
      done: false,
    })
    // Even back near the start, it stays an arrow.
    expect(tracker.move(at(2, 102, 101, 340))?.type).toBe('arrow')
    expect(tracker.up(at(2, 250, 190, 2000))).toEqual({
      type: 'arrow',
      from: { x: 100, y: 100 },
      to: { x: 250, y: 190 },
      done: true,
    })
    // The next press is plain again.
    expect(tracker.down(at(3, 250, 190, 2050))).toBeNull()
    expect(tracker.up(at(3, 250, 190, 2100))?.type).toBe('tap')
  })

  it('makes a second touch that comes too late a new tap', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    expect(tracker.down(at(2, 100, 100, 100 + DOUBLE_TAP_MS + 1))).toBeNull()
    expect(tracker.up(at(2, 100, 100, 450))).toEqual({ type: 'tap', point: { x: 100, y: 100 } })
  })

  it('makes a second touch too far away a new tap', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    expect(tracker.down(at(2, 100 + DOUBLE_TAP_SLOP + 1, 100, 150))).toBeNull()
    expect(tracker.up(at(2, 131, 100, 200))).toEqual({ type: 'tap', point: { x: 131, y: 100 } })
  })

  it('takes three quick taps as a double tap and a new tap', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    tracker.down(at(2, 100, 100, 150))
    expect(tracker.up(at(2, 100, 100, 200))?.type).toBe('doubleTap')
    expect(tracker.down(at(3, 100, 100, 250))).toBeNull()
    expect(tracker.up(at(3, 100, 100, 300))?.type).toBe('tap')
  })

  it('does nothing more when the second touch is held', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    expect(tracker.down(at(2, 100, 100, 150))).toEqual({ type: 'takeBack' })
    expect(tracker.up(at(2, 100, 100, 150 + TAP_MAX_MS + 1))).toBeNull()
  })

  it('pinches when a second finger joins the second touch, calling off an arrow', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    tracker.down(at(2, 100, 100, 150))
    tracker.move(at(2, 160, 100, 180))
    // The arrow ends where it started, which draws nothing.
    expect(tracker.down(at(3, 300, 100, 200))).toEqual({
      type: 'arrow',
      from: { x: 100, y: 100 },
      to: { x: 100, y: 100 },
      done: true,
    })
    expect(tracker.move(at(3, 340, 100, 220))?.type).toBe('pinch')
    expect(tracker.up(at(3, 340, 100, 240))).toBeNull()
    expect(tracker.up(at(2, 160, 100, 260))).toBeNull()
  })

  it('pinches without an arrow when a second finger joins before the drag', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    tracker.down(at(2, 100, 100, 150))
    expect(tracker.down(at(3, 200, 100, 170))).toBeNull()
    expect(tracker.move(at(3, 250, 100, 190))?.type).toBe('pinch')
  })

  it('calls off an arrow when the browser takes the pointer', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    tracker.down(at(2, 100, 100, 150))
    tracker.move(at(2, 180, 100, 180))
    expect(tracker.cancel(2)).toEqual({
      type: 'arrow',
      from: { x: 100, y: 100 },
      to: { x: 100, y: 100 },
      done: true,
    })
    expect(tracker.active).toBe(false)
  })

  it('does not start a double tap after a pan or a cancelled press', () => {
    const tracker = doubleTapper()
    tracker.down(at(1, 100, 100, 0))
    tracker.move(at(1, 150, 100, 50))
    expect(tracker.up(at(1, 150, 100, 80))).toBeNull()
    expect(tracker.down(at(2, 150, 100, 100))).toBeNull()
    tracker.cancel(2)
    expect(tracker.down(at(3, 150, 100, 150))).toBeNull()
  })

  it('pans as before with a single press after a tap', () => {
    const tracker = doubleTapper()
    firstTap(tracker)
    // Too late for a double tap: a plain pan.
    tracker.down(at(2, 100, 100, 1000))
    expect(tracker.move(at(2, 140, 100, 1020))).toEqual({ type: 'pan', dx: 40, dy: 0 })
  })

  it('reports only plain taps without the option', () => {
    const tracker = new GestureTracker()
    firstTap(tracker)
    expect(tracker.down(at(2, 100, 100, 150))).toBeNull()
    expect(tracker.up(at(2, 100, 100, 200))).toEqual({ type: 'tap', point: { x: 100, y: 100 } })
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
