import type { SyncState } from '../offline/sync'
import { de } from '../text/de'

const t = de.maps

/**
 * The "not synced yet" mark (knowledge/decisions/offline-prep-pwa.md): an item the server
 * has never seen is "Nur auf diesem Gerät", a synced one with local changes "Nicht
 * synchronisiert", and one the last sync could not save "Konflikt" or "Abgelehnt". Nothing
 * for an item in sync.
 */
export function SyncMark({ sync, className = '' }: { sync: SyncState; className?: string }) {
  const { issue } = sync
  if (!issue && !sync.changed) return null
  let label: string
  let title: string | undefined
  if (issue?.kind === 'conflict') {
    label = de.sync.marks.conflict
    title = de.sync.marks.conflictTitle
  } else if (issue?.kind === 'rejected') {
    label = de.sync.marks.rejected
    title = de.sync.marks.rejectedTitle
  } else if (issue?.kind === 'vanished') {
    label = de.sync.marks.vanished
  } else if (sync.baseVersion === 0) {
    label = t.localOnly
    title = t.localOnlyTitle
  } else {
    label = t.notSynced
  }
  return (
    <span
      title={title}
      className={`inline-block shrink-0 rounded-full border border-candle/60 px-2 py-0.5 text-xs whitespace-nowrap text-candle ${className}`}
    >
      {label}
    </span>
  )
}
