// The fight page's pings and arrows (knowledge/features/pings-and-arrows.md): the person's
// own, shown at once and sent, and others' from the hub, each dropped when its time is
// up. Nothing is saved; a device that joins later sees none of the ones already shown.
// A person has at most one arrow: a new one replaces the old, the own one being drawn too.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ArrowDrawnEvent,
  BoardState,
  DrawArrowRequest,
  PingRequest,
  PingedEvent,
} from '../api/types'
import { footprint, type GridPoint } from '../board/geometry'
import {
  ARROW_MS,
  PING_MS,
  pingExpired,
  type ArrowStart,
  type PingTarget,
  type ShownPing,
} from '../board/pings'
import { de } from '../text/de'
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

/** Someone without a character in the fight pings in white. */
export const FALLBACK_PING_COLOR = '#ffffff'

let counter = 0
const nextId = () => `ping-${++counter}`

/** Whether an arrow from `from` to `to` ends where it started: its cell, or its token. */
function endsAtStart(board: BoardState, from: PingTarget, to: GridPoint): boolean {
  const token = from.tokenId && board.tokens.find((candidate) => candidate.id === from.tokenId)
  if (token) {
    const n = footprint(token.size)
    return to.x >= token.x && to.y >= token.y && to.x < token.x + n && to.y < token.y + n
  }
  return to.x === from.cell.x && to.y === from.cell.y
}

/** Adds a ping; an arrow takes the place of the person's earlier one. */
function withPing(list: readonly ShownPing[], ping: ShownPing): ShownPing[] {
  const kept =
    ping.kind === 'arrow'
      ? list.filter((other) => !(other.kind === 'arrow' && other.userId === ping.userId))
      : list
  return [...kept, ping]
}

/** `board`: the shown board, for the person's colour and name and the tokens pinged. */
export function usePings(board: BoardState, userId: string): Pings {
  const [shown, setShown] = useState<readonly ShownPing[]>([])
  const latest = useRef({ board, userId })
  useEffect(() => {
    latest.current = { board, userId }
  })
  /** The arrow being drawn on this device, kept while the finger moves. */
  const drawing = useRef<{ id: string; at: number } | null>(null)

  const person = useCallback((id: string) => {
    const { board, userId } = latest.current
    const found = board.people?.find((p) => p.userId === id)
    return {
      name: found?.displayName ?? (id === userId ? de.pings.me : '?'),
      color: found?.pingColor ?? FALLBACK_PING_COLOR,
    }
  }, [])

  // Drop each ping when its time is up; an arrow still being drawn stays.
  useEffect(() => {
    const now = performance.now()
    const live = shown.filter((ping) => ping.kind !== 'arrow' || ping.done)
    if (live.length === 0) return
    const ends = live.map((ping) => ping.at + (ping.kind === 'arrow' ? ARROW_MS : PING_MS))
    const wait = Math.max(0, Math.min(...ends) - now)
    const timer = setTimeout(() => {
      const at = performance.now()
      setShown((list) =>
        list.some((ping) => isOver(ping, at)) ? list.filter((ping) => !isOver(ping, at)) : list,
      )
    }, wait + 1)
    return () => clearTimeout(timer)
  }, [shown])

  const events = useMemo<TableEvents>(
    () => ({
      onPinged: (event: PingedEvent) => {
        const { name } = person(event.userId)
        const base = {
          id: nextId(),
          userId: event.userId,
          color: event.color,
          name,
          at: performance.now(),
        }
        const ping: ShownPing | null = event.tokenId
          ? { ...base, kind: 'token', tokenId: event.tokenId }
          : event.cell
            ? { ...base, kind: 'cell', cell: event.cell }
            : null
        if (ping) setShown((list) => withPing(list, ping))
      },
      onArrowDrawn: (event: ArrowDrawnEvent) => {
        const from: ArrowStart | null = event.fromTokenId
          ? { tokenId: event.fromTokenId }
          : event.fromCell
            ? { cell: event.fromCell }
            : null
        if (!from) return
        const { name } = person(event.userId)
        const ping: ShownPing = {
          id: nextId(),
          userId: event.userId,
          color: event.color,
          name,
          at: performance.now(),
          kind: 'arrow',
          from,
          to: event.to,
          done: true,
        }
        setShown((list) => withPing(list, ping))
      },
    }),
    [person],
  )

  const ping = useCallback(
    (target: PingTarget): Omit<PingRequest, 'encounterId'> => {
      const { userId } = latest.current
      const base = { id: nextId(), userId, ...person(userId), at: performance.now() }
      const shownPing: ShownPing = target.tokenId
        ? { ...base, kind: 'token', tokenId: target.tokenId }
        : { ...base, kind: 'cell', cell: target.cell }
      setShown((list) => withPing(list, shownPing))
      return target.tokenId
        ? { cell: null, tokenId: target.tokenId }
        : { cell: target.cell, tokenId: null }
    },
    [person],
  )

  const arrow = useCallback(
    (
      from: PingTarget,
      to: GridPoint,
      done: boolean,
    ): Omit<DrawArrowRequest, 'encounterId'> | null => {
      const { board, userId } = latest.current
      const current = drawing.current
      if (done) drawing.current = null
      if (endsAtStart(board, from, to)) {
        // Nothing to draw: the arrow being drawn goes away.
        if (current) setShown((list) => list.filter((p) => p.id !== current.id))
        return null
      }
      const now = performance.now()
      const id = current?.id ?? nextId()
      if (!done) drawing.current = { id, at: now }
      const start: ArrowStart = from.tokenId ? { tokenId: from.tokenId } : { cell: from.cell }
      const shownArrow: ShownPing = {
        id,
        userId,
        ...person(userId),
        at: now,
        kind: 'arrow',
        from: start,
        to,
        done,
      }
      setShown((list) => withPing(list, shownArrow))
      if (!done) return null
      return from.tokenId
        ? { fromCell: null, fromTokenId: from.tokenId, to }
        : { fromCell: from.cell, fromTokenId: null, to }
    },
    [person],
  )

  return useMemo(() => ({ shown, events, ping, arrow }), [shown, events, ping, arrow])
}

/** Over: its time is up; the own arrow still being drawn is never over. */
function isOver(ping: ShownPing, now: number): boolean {
  if (ping.kind === 'arrow' && !ping.done) return false
  return pingExpired(ping, now)
}
