// The question before an archived map is deleted (knowledge/domain/battle-map.md,
// "Deleting"): names the unplayed encounters that go with it, and says why a map that a
// running or ended fight uses stays. The server decides; this device's copy only tells.
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button, ErrorAlert, Loading } from '../components/ui'
import type { LocalMap } from '../editor/model'
import { useLocalUser } from '../offline/localUser'
import type { LocalEncounter } from '../offline/model'
import { deleteMap, useOnline } from '../sync'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'

const t = de.maps.deleteDialog

export function DeleteMapDialog({
  map,
  onClose,
  onDeleted,
}: {
  map: LocalMap
  onClose: () => void
  onDeleted: () => void
}) {
  const { db } = useLocalUser()
  const online = useOnline()
  const encounters = useLiveQuery(
    () => db.encounters.where('battleMapId').equals(map.id).toArray(),
    [db, map.id],
  )
  const sessions = useLiveQuery(
    () => db.sessions.where('campaignId').equals(map.campaignId).toArray(),
    [db, map.campaignId],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const played = encounters?.filter((e) => e.status === 'active' || e.status === 'ended') ?? []
  const unplayed = encounters?.filter((e) => e.status === 'draft' || e.status === 'ready') ?? []
  // A map the server never saw, or no longer lists, is deleted on this device alone.
  const onServer = map.sync.baseVersion > 0 && map.sync.issue?.kind !== 'vanished'
  const needsConnection = onServer && !online

  const label = (encounter: LocalEncounter) => {
    const session = sessions?.find((s) => s.id === encounter.sessionId)
    return session ? t.inSession(encounter.name, session.title) : encounter.name
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteMap(db, map.id)
      if (result === 'deleted') {
        onDeleted()
        return
      }
      setError(result === 'offline' ? t.offline : t.blocked)
    } catch (failure) {
      setError(failure)
    }
    setBusy(false)
  }

  return (
    <Modal title={t.title(map.name)} onClose={onClose} size="narrow">
      {encounters === undefined || sessions === undefined ? (
        <Loading />
      ) : played.length > 0 ? (
        <EncounterList intro={t.played} encounters={played} label={label} />
      ) : (
        <>
          <p>{t.body}</p>
          {unplayed.length > 0 && (
            <EncounterList
              intro={t.encounters(unplayed.length)}
              encounters={unplayed}
              label={label}
            />
          )}
          {onServer && <p className="text-sm text-dim">{t.images}</p>}
          {needsConnection && <p className="text-sm text-candle">{t.offline}</p>}
        </>
      )}
      <ErrorAlert error={error} />
      <div className="flex flex-wrap gap-2">
        {played.length === 0 && (
          <Button
            variant="primary"
            busy={busy}
            disabled={encounters === undefined || needsConnection}
            onClick={() => void confirm()}
          >
            {t.confirm}
          </Button>
        )}
        <Button onClick={onClose}>{de.common.cancel}</Button>
      </div>
    </Modal>
  )
}

function EncounterList({
  intro,
  encounters,
  label,
}: {
  intro: string
  encounters: LocalEncounter[]
  label: (encounter: LocalEncounter) => string
}) {
  return (
    <div className="flex flex-col gap-1">
      <p>{intro}</p>
      <ul className="list-disc pl-6">
        {encounters.map((encounter) => (
          <li key={encounter.id} className="break-words">
            {label(encounter)}
          </li>
        ))}
      </ul>
    </div>
  )
}
