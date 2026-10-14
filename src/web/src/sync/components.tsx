// The sync client's React parts: the provider with the automatic syncs, and the status
// with its "Sync" button (knowledge/decisions/offline-prep-pwa.md, "When it runs").
import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useMemo, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { signInPath } from '../auth/auth'
import { campaignKeys } from '../campaigns/queries'
import { offlineDb } from '../offline/db'
import { lastUser } from '../offline/identity'
import { LocalUserContext } from '../offline/localUser'
import { useServerStatus } from '../server/serverStatus'
import { de } from '../text/de'
import { syncNow, useSyncStatus, type SyncStatus } from './client'
import { SyncContext, useSyncDb } from './context'
import { IssuesDialog } from './IssuesDialog'
import { holdRecords, openSyncIssues, runLater, useSyncStore } from './state'

const t = de.sync

/** Leaving the editor syncs a moment later, so the editor's last autosave is in the database. */
export const LEAVE_SYNC_DELAY_MS = 300

/**
 * Mounted once per page branch while a local user is known: automatic syncs (connection
 * back) and the dialogs for conflicts and rejections.
 */
export function SyncProvider({ children }: { children?: ReactNode }) {
  const local = useContext(LocalUserContext)
  // Pages behind the server gate don't have the local user; the device's last user is it.
  const userId = local?.user.id ?? lastUser()?.id
  const value = useMemo(
    () => (local ? { db: local.db } : userId ? { db: offlineDb(userId) } : null),
    [local, userId],
  )
  return (
    <SyncContext.Provider value={value}>
      {children}
      {value && <SyncRuntime />}
    </SyncContext.Provider>
  )
}

/** The automatic syncs and the dialogs; renders only the dialog. */
function SyncRuntime() {
  const db = useSyncDb()!
  const queryClient = useQueryClient()
  const campaignsCreated = useSyncStore((s) => s.campaignsCreated)

  // The connection came back: a browser event, or the server gate finding the server again.
  useEffect(() => {
    const onOnline = () => void syncNow(db, { reason: 'online' })
    window.addEventListener('online', onOnline)
    let previous = useServerStatus.getState().status
    const unsubscribe = useServerStatus.subscribe(({ status }) => {
      if (status === 'ready' && previous === 'offline') onOnline()
      previous = status
    })
    return () => {
      window.removeEventListener('online', onOnline)
      unsubscribe()
    }
  }, [db])

  // A campaign made on this device reached the server: the campaign list has it now.
  useEffect(() => {
    if (campaignsCreated > 0) void queryClient.invalidateQueries({ queryKey: campaignKeys.list })
  }, [campaignsCreated, queryClient])

  return <IssuesDialog />
}

function pendingText(pending: number): string {
  return pending === 1 ? t.status.pendingOne : t.status.pending(pending)
}

function statusText(status: SyncStatus): string {
  switch (status.state) {
    case 'syncing':
      return t.status.syncing
    case 'outdated':
      return t.status.outdated
    case 'signedOut':
      return t.status.signedOut
    case 'offline':
      return status.pending > 0
        ? t.status.offlinePending(pendingText(status.pending))
        : t.status.offline
    case 'attention':
      return status.pending > 0 ? pendingText(status.pending) : t.status.attentionOnly
    case 'idle':
      return status.pending > 0 ? pendingText(status.pending) : t.status.allSynced
  }
}

/** The status line with the "Sync" button; conflicts and rejections get a button of their own. */
export function SyncStatusView() {
  const db = useSyncDb()
  const status = useSyncStatus()
  const failed = useSyncStore((s) => s.failed)
  const location = useLocation()
  if (!db) return null

  const syncing = status.state === 'syncing'
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span role="status" className="min-w-0 text-dim">
        {statusText(status)}
      </span>
      {failed && <span className="text-red-300">{t.status.failed}</span>}
      {status.state === 'attention' && (
        <button
          type="button"
          onClick={() => openSyncIssues()}
          className="min-h-9 rounded-lg border border-candle/60 px-3 text-candle hover:bg-candle/10"
        >
          {status.issues === 1 ? t.status.reviewOne : t.status.review(status.issues)}
        </button>
      )}
      {status.state === 'outdated' ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-9 rounded-lg border border-candle/60 px-3 text-candle hover:bg-candle/10"
        >
          {t.status.reload}
        </button>
      ) : status.state === 'signedOut' ? (
        <Link
          to={signInPath(location.pathname + location.search)}
          className="flex min-h-9 items-center rounded-lg border border-candle/60 px-3 text-candle hover:bg-candle/10"
        >
          {t.status.signIn}
        </Link>
      ) : (
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncNow(db, { reason: 'button' })}
          className="min-h-9 rounded-lg border border-line px-3 text-parchment hover:border-candle disabled:opacity-60"
        >
          {t.status.button}
        </button>
      )}
    </div>
  )
}

/**
 * The editor header's status and "Sync" button. Opening the editor while online pulls;
 * leaving it syncs. The map and encounter it has open are left alone by a pull, since the
 * editor owns them meanwhile.
 */
export function SyncStatusItem() {
  const db = useSyncDb()
  const { mapId, encounterId } = useParams()
  useEffect(() => {
    if (!db) return
    const release = holdRecords([mapId, encounterId].filter((id): id is string => !!id))
    void syncNow(db, { reason: 'editorOpen' })
    return () => {
      release()
      runLater(() => void syncNow(db, { reason: 'leaveEditor' }), LEAVE_SYNC_DELAY_MS)
    }
  }, [db, mapId, encounterId])
  if (!db) return null
  return <SyncStatusView />
}
