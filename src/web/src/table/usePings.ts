// The fight page's pings and arrows (knowledge/features/pings-and-arrows.md): the person's
// own, shown at once and sent, and others' from the hub, each dropped when its time is
// up. Nothing is saved; a device that joins later sees none of the ones already shown.
//
// Stage 9 contract: the interface is final; the board renderer lane fills in the body.
import { useMemo } from 'react'
import type { BoardState, DrawArrowRequest, PingRequest } from '../api/types'
import type { GridPoint } from '../board/geometry'
import type { PingTarget, ShownPing } from '../board/pings'
import type { TableEvents } from './useTable'

export interface Pings {
  /** Pings and arrows to draw now: own and others'. */
  shown: readonly ShownPing[]
  /** Pass to useTable: others' pings and arrows. */
  events: TableEvents
  /** The person's own ping: shown at once; returns what to send (table.ping). */
  ping: (target: PingTarget) => Omit<PingRequest, 'encounterId'>
  /**
   * The person's own arrow while drawing (`done` false: shown, not sent) and when the
   * finger lifts (`done` true: returns what to send, table.drawArrow). Null when the
   * arrow ends where it started, which draws nothing.
   */
  arrow: (
    from: PingTarget,
    to: GridPoint,
    done: boolean,
  ) => Omit<DrawArrowRequest, 'encounterId'> | null
}

/** `board`: the shown board, for the person's colour and name and the tokens pinged. */
export function usePings(board: BoardState, userId: string): Pings {
  void board
  void userId
  return useMemo(
    () => ({
      shown: [],
      events: {},
      ping: (target) =>
        target.tokenId
          ? { cell: null, tokenId: target.tokenId }
          : { cell: target.cell, tokenId: null },
      arrow: (from, to, done) =>
        done
          ? from.tokenId
            ? { fromCell: null, fromTokenId: from.tokenId, to }
            : { fromCell: from.cell, fromTokenId: null, to }
          : null,
    }),
    [],
  )
}
