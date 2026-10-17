// Turns raw pointer events into board gestures: one finger or the mouse pans, two
// fingers pinch-zoom, and a tap is a short press that neither moved nor pinched.
// Stage 9 adds the double tap (knowledge/features/pings-and-arrows.md, "Gestures"): a
// tap, then a second touch within DOUBLE_TAP_MS after it and within DOUBLE_TAP_SLOP of
// it. The first tap is reported at once as a 'tap'; the second touch reports 'takeBack'
// as it goes down, so the board can undo what the first tap did, then either
// 'doubleTap' (lifted without moving) or 'arrow' (dragged: every move, then once with
// done when it lifts). A second touch that comes too late or too far is a new tap.
// Only trackers made with `{ doubleTap: true }` (the board) report these; the crop
// dialog's tracker keeps plain taps.
// Pure and clock-free (times come in with the events), so tests can drive it.
import type { Point } from './viewport'

export type PointerKind = 'mouse' | 'touch' | 'pen'

export interface PointerSample {
  id: number
  x: number
  y: number
  /** Milliseconds, e.g. the event's timeStamp. */
  time: number
  kind: PointerKind
}

export type Gesture =
  | { type: 'pan'; dx: number; dy: number }
  /** Zoom by `factor` around `center`, then move by (dx, dy): the fingers' midpoint moved. */
  | { type: 'pinch'; center: Point; factor: number; dx: number; dy: number }
  | { type: 'tap'; point: Point }
  /** The second touch of a double tap is down: undo what the first tap did. */
  | { type: 'takeBack' }
  /** A double tap at the first tap's point. */
  | { type: 'doubleTap'; point: Point }
  /** A double tap dragged: from the first tap's point to the finger; `done` when it lifts. */
  | { type: 'arrow'; from: Point; to: Point; done: boolean }

/** How far a press may wander and still count as a tap, in CSS pixels. Fingers wobble more. */
export const TAP_SLOP: Record<PointerKind, number> = { mouse: 4, pen: 6, touch: 10 }

/** A longer press isn't a tap. Holding stays free (knowledge/features/pings-and-arrows.md, "Notes"). */
export const TAP_MAX_MS = 500

/** The longest wait from a tap's release to the second touch of a double tap. */
export const DOUBLE_TAP_MS = 300

/** How far the second touch of a double tap may land from the first, in CSS pixels. */
export const DOUBLE_TAP_SLOP = 30

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export interface GestureTrackerOptions {
  /** Report double taps and arrows (the board); without it every tap is a plain tap. */
  doubleTap?: boolean
}

/** The second touch of a double tap: where the first tap was, and whether it drags. */
interface SecondTouch {
  from: Point
  dragging: boolean
}

export class GestureTracker {
  private readonly pointers = new Map<number, Point>()
  private start: (Point & { time: number; kind: PointerKind }) | null = null
  /** Past the tap slop or pinched: whatever happens now, it isn't a tap. */
  private moved = false
  private readonly doubleTaps: boolean
  /** The last plain tap and when it was released, while a second touch may still follow. */
  private lastTap: { point: Point; time: number } | null = null
  /** The second touch of a double tap is down. */
  private second: SecondTouch | null = null

  constructor(options: GestureTrackerOptions = {}) {
    this.doubleTaps = options.doubleTap ?? false
  }

  /** Whether any pointer is down. */
  get active(): boolean {
    return this.pointers.size > 0
  }

  /**
   * A pointer went down. Returns 'takeBack' when it is the second touch of a double tap,
   * and the end of an arrow when a second finger joins one: the arrow is called off and
   * the fingers pinch.
   */
  down(p: PointerSample): Gesture | null {
    if (this.pointers.size === 0) {
      this.start = { x: p.x, y: p.y, time: p.time, kind: p.kind }
      this.moved = false
      this.pointers.set(p.id, { x: p.x, y: p.y })
      const last = this.lastTap
      this.lastTap = null
      if (
        last &&
        p.time - last.time <= DOUBLE_TAP_MS &&
        distance(last.point, p) <= DOUBLE_TAP_SLOP
      ) {
        this.second = { from: last.point, dragging: false }
        return { type: 'takeBack' }
      }
      return null
    }
    // A second finger: this gesture is a pinch from now on, never a tap.
    this.moved = true
    this.pointers.set(p.id, { x: p.x, y: p.y })
    return this.endSecond()
  }

  move(p: PointerSample): Gesture | null {
    const previous = this.pointers.get(p.id)
    if (!previous) return null
    const now = { x: p.x, y: p.y }

    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.keys()]
      if (p.id !== a && p.id !== b) {
        this.pointers.set(p.id, now)
        return null
      }
      const before = [this.pointers.get(a!)!, this.pointers.get(b!)!] as const
      this.pointers.set(p.id, now)
      const after = [this.pointers.get(a!)!, this.pointers.get(b!)!] as const
      const spreadBefore = distance(before[0], before[1])
      const spreadAfter = distance(after[0], after[1])
      const center = midpoint(before[0], before[1])
      const moved = midpoint(after[0], after[1])
      return {
        type: 'pinch',
        center,
        factor: spreadBefore > 0 ? spreadAfter / spreadBefore : 1,
        dx: moved.x - center.x,
        dy: moved.y - center.y,
      }
    }

    this.pointers.set(p.id, now)
    const start = this.start!
    const second = this.second
    if (second) {
      // The second touch of a double tap draws an arrow; it never pans.
      if (!second.dragging) {
        if (distance(start, now) <= TAP_SLOP[start.kind]) return null
        second.dragging = true
        this.moved = true
      }
      return { type: 'arrow', from: second.from, to: now, done: false }
    }
    if (!this.moved) {
      if (distance(start, now) <= TAP_SLOP[start.kind]) return null
      // Past the slop: pan by everything since the press, so the map stays under the finger.
      this.moved = true
      return { type: 'pan', dx: now.x - start.x, dy: now.y - start.y }
    }
    return { type: 'pan', dx: now.x - previous.x, dy: now.y - previous.y }
  }

  up(p: PointerSample): Gesture | null {
    if (!this.pointers.delete(p.id)) return null
    if (this.pointers.size > 0) return null
    const start = this.start
    const second = this.second
    this.start = null
    this.second = null
    if (!start) return null
    if (second?.dragging) {
      return { type: 'arrow', from: second.from, to: { x: p.x, y: p.y }, done: true }
    }
    if (this.moved) return null
    if (distance(start, p) > TAP_SLOP[start.kind]) return null
    // Held too long: no tap, and after a first tap no double tap either (it was taken back).
    if (p.time - start.time > TAP_MAX_MS) return null
    if (second) return { type: 'doubleTap', point: second.from }
    const point = { x: start.x, y: start.y }
    if (this.doubleTaps) this.lastTap = { point, time: p.time }
    return { type: 'tap', point }
  }

  /**
   * The browser took the pointer away (a system gesture, a call): no tap from this press.
   * An arrow being drawn is called off: it ends where it started, which draws nothing.
   */
  cancel(id: number): Gesture | null {
    if (!this.pointers.delete(id)) return null
    this.moved = true
    this.lastTap = null
    const ended = this.endSecond()
    if (this.pointers.size === 0) this.start = null
    return ended
  }

  /** Lets go of a double tap's second touch; an arrow being drawn ends where it started. */
  private endSecond(): Gesture | null {
    const second = this.second
    this.second = null
    if (!second?.dragging) return null
    return { type: 'arrow', from: second.from, to: second.from, done: true }
  }
}

/**
 * Zoom factor for one wheel event. Mouse wheels zoom in steps of about 20 %;
 * trackpad pinches arrive as wheel events with ctrlKey and small deltas.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  // deltaMode 1 counts lines, 2 pages; turn both into pixels.
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  const speed = ctrlKey ? 0.01 : 0.002
  const step = Math.max(-1, Math.min(1, pixels * speed))
  return Math.exp(-step)
}
