// Pings and arrows as the board draws them (knowledge/features/pings-and-arrows.md). The
// page keeps the list (table/usePings.ts) and hands it to the board, which draws each one
// for its lifetime and puts a marker at the screen's edge for those outside the view.
//
// Stage 9 contract: the types and lifetimes are final; the board renderer lane draws them.
import type { GridPoint } from './geometry'

/** How long a cell or token ping pulses. */
export const PING_MS = 3_000
/** How long an arrow stays before it has faded. */
export const ARROW_MS = 8_000

/** Where an arrow starts: a cell, or a token it follows. */
export type ArrowStart = { cell: GridPoint } | { tokenId: string }

interface ShownBase {
  /** Unique per shown ping, for React keys and replacing a person's arrow. */
  id: string
  userId: string
  /** "#rrggbb", the person's ping colour. */
  color: string
  /** The person's display name, drawn under a ping and at an arrow's tail. */
  name: string
  /** When it started, in performance.now() milliseconds. */
  at: number
}

export type ShownPing =
  | (ShownBase & { kind: 'cell'; cell: GridPoint })
  /** Follows the token if it moves. */
  | (ShownBase & { kind: 'token'; tokenId: string })
  /** `done` false while the person's own finger still draws it. */
  | (ShownBase & { kind: 'arrow'; from: ArrowStart; to: GridPoint; done: boolean })

/** What a double tap or the start of an arrow hit: the cell, and the token drawn on top there. */
export interface PingTarget {
  cell: GridPoint
  tokenId?: string
}

/** Whether a shown ping is over at `now` (performance.now()). */
export function pingExpired(ping: ShownPing, now: number): boolean {
  return now - ping.at >= (ping.kind === 'arrow' ? ARROW_MS : PING_MS)
}
