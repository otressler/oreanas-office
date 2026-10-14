import type { SyncState } from '../editor/model'
import { de } from '../text/de'

const t = de.maps

/**
 * The "not synced yet" mark (knowledge/decisions/offline-prep-pwa.md): a map the server
 * has never seen is "Nur auf diesem Gerät", a synced one with local changes "Nicht
 * synchronisiert". Nothing for a map in sync.
 */
export function SyncMark({ sync, className = '' }: { sync: SyncState; className?: string }) {
  if (!sync.changed) return null
  const local = sync.baseVersion === 0
  return (
    <span
      title={local ? t.localOnlyTitle : undefined}
      className={`inline-block shrink-0 rounded-full border border-candle/60 px-2 py-0.5 text-xs whitespace-nowrap text-candle ${className}`}
    >
      {local ? t.localOnly : t.notSynced}
    </span>
  )
}
