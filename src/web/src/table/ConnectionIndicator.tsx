import { de } from '../text/de'
import type { TableStatus } from './connection'

const DOT: Record<TableStatus, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-candle motion-safe:animate-pulse',
  reconnecting: 'bg-candle motion-safe:animate-pulse',
  offline: 'bg-red-400',
  paused: 'bg-dim',
  idle: 'bg-dim',
}

/**
 * The live table's connection state in the fight screen's top bar
 * (knowledge/decisions/realtime-sync.md, "Disconnected"): a dot, plus text whenever
 * moving is off. Screen readers hear every change.
 */
export function ConnectionIndicator({ status }: { status: TableStatus }) {
  const connected = status === 'connected'
  return (
    <p
      aria-live="polite"
      data-testid="connection-indicator"
      data-status={status}
      className="flex min-w-0 items-center gap-1.5 text-sm text-dim"
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${DOT[status]}`} />
      <span className={connected ? 'sr-only' : 'truncate'}>{de.table.status[status]}</span>
    </p>
  )
}
