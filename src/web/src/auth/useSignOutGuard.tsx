// The warning before signing out with changes that are not synced
// (knowledge/decisions/offline-prep-pwa.md, "Per user and kept"). The data stays in this
// browser for the user either way; the warning is about other devices and about a browser
// that clears its storage.
import { useState, type ReactNode } from 'react'
import { Button, ErrorAlert } from '../components/ui'
import { offlineDb } from '../offline/db'
import { lastUser } from '../offline/identity'
import { countUnsynced, syncNow, type SyncResult } from '../sync'
import { Modal } from '../sync/Modal'
import type { Unsynced } from '../sync/state'
import { de } from '../text/de'

const t = de.sync.signOut

export function useSignOutGuard(): {
  /** Runs `proceed` at once, or after the user agrees when changes are unsynced. */
  request: (proceed: () => void) => Promise<void>
  dialog: ReactNode
} {
  const [asking, setAsking] = useState<{ proceed: () => void; counts: Unsynced } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function request(proceed: () => void) {
    const user = lastUser()
    let counts: Unsynced = { pending: 0, issues: 0 }
    try {
      if (user) counts = await countUnsynced(offlineDb(user.id))
    } catch {
      // Without IndexedDB there is nothing stored to lose.
    }
    if (counts.pending === 0 && counts.issues === 0) proceed()
    else setAsking({ proceed, counts })
  }

  async function syncFirst() {
    const user = lastUser()
    if (!asking || !user) return
    const db = offlineDb(user.id)
    setBusy(true)
    setError(null)
    let result: SyncResult = { ok: false, issues: 0 }
    try {
      result = await syncNow(db, { reason: 'button' })
    } finally {
      setBusy(false)
    }
    const counts = await countUnsynced(db)
    if (counts.pending === 0 && counts.issues === 0) {
      setAsking(null)
      asking.proceed()
      return
    }
    if (!result.ok) setError(de.requestErrors.network)
    setAsking({ ...asking, counts })
  }

  const dialog = asking && (
    <Modal title={t.title} onClose={() => setAsking(null)}>
      {asking.counts.pending > 0 && <p>{t.body(asking.counts.pending)}</p>}
      {asking.counts.issues > 0 && <p>{t.issuesBody}</p>}
      <p className="text-sm text-dim">{t.keptNote}</p>
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" busy={busy} onClick={() => void syncFirst()}>
          {t.syncNow}
        </Button>
        <Button
          onClick={() => {
            setAsking(null)
            asking.proceed()
          }}
        >
          {t.anyway}
        </Button>
        <Button onClick={() => setAsking(null)}>{de.common.cancel}</Button>
      </div>
    </Modal>
  )
  return { request, dialog }
}
