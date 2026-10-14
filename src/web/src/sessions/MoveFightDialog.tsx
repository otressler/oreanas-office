// "Verschieben": a draft or ready fight goes to another planned or running session the same
// DM runs (knowledge/domain/session.md). Saved on the device, then synced by the caller.
import { useState } from 'react'
import { useSessions } from '../campaigns/queries'
import { Badge, Button, LoadError, Loading } from '../components/ui'
import { moveEncounter } from '../editor/encounter/encounters'
import { formatDate } from '../lib/dates'
import type { OfflineDb } from '../offline/db'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import type { FightRow } from './FightsPanel'

const t = de.sessionPage

export function MoveFightDialog({
  db,
  campaignId,
  sessionId,
  fight,
  onClose,
  onMoved,
}: {
  db: OfflineDb
  campaignId: string
  sessionId: string
  fight: FightRow
  onClose: () => void
  onMoved: () => Promise<void>
}) {
  const sessions = useSessions(campaignId)
  const [busy, setBusy] = useState(false)
  const targets = (sessions.data ?? []).filter(
    (session) => session.isSessionDm && session.status !== 'ended' && session.id !== sessionId,
  )

  async function move(targetId: string) {
    setBusy(true)
    try {
      await moveEncounter(db, fight.id, targetId)
      await onMoved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t.moveTitle(fight.name)} onClose={onClose}>
      {sessions.isPending ? (
        <Loading />
      ) : sessions.isError ? (
        <LoadError error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : targets.length === 0 ? (
        <p className="text-dim">{t.moveNoTarget}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-dim">{t.moveHelp}</p>
          <ul className="flex flex-col divide-y divide-line">
            {targets.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{session.title}</span>
                  <span className="text-sm text-dim">{formatDate(session.date)}</span>
                </div>
                <Badge tone={session.status === 'active' ? 'candle' : 'dim'}>
                  {de.sessionStatus[session.status]}
                </Badge>
                <Button disabled={busy} onClick={() => void move(session.id)}>
                  {t.moveTo}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
