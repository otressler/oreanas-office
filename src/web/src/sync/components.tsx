// The sync client's React parts. Stubs in the stage 6 contract.
import type { ReactNode } from 'react'

/**
 * Mounted once per page branch while a local user is known: automatic syncs (connection
 * back) and the dialogs for conflicts and rejections.
 */
export function SyncProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

/** The editor header's status and "Sync" button. */
export function SyncStatusItem() {
  return null
}
