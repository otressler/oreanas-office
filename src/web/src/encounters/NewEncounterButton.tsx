// "Neue Begegnung" on the campaign page: pick one of the campaign's maps, and a new draft
// encounter on it opens in the editor, where the DM places creatures, marks it ready and
// starts it (knowledge/features/dm-map-editor.md). Before this, the campaign page offered
// only the import, which always makes a new map without a background.
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, ButtonLink, Loading } from '../components/ui'
import { createEncounter } from '../editor/encounter/encounters'
import { listMaps } from '../editor/maps'
import { encounterEditorPath, mapListPath } from '../editor/paths'
import type { LocalMap } from '../editor/model'
import { formatMeters } from '../lib/units'
import { useWideScreen } from '../lib/useWideScreen'
import type { OfflineDb } from '../offline/db'
import { useSyncDb } from '../sync'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'

const t = de.encounters.create

export function NewEncounterButton({ campaignId }: { campaignId: string }) {
  const db = useSyncDb()
  const [open, setOpen] = useState(false)
  // The maps live in this browser per user; without its database there is nothing to pick.
  if (!db) return null
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t.button}</Button>
      {open && <MapPicker db={db} campaignId={campaignId} onClose={() => setOpen(false)} />}
    </>
  )
}

function MapPicker({
  db,
  campaignId,
  onClose,
}: {
  db: OfflineDb
  campaignId: string
  onClose: () => void
}) {
  const wide = useWideScreen()
  const navigate = useNavigate()
  const maps = useLiveQuery(() => listMaps(db, campaignId), [db, campaignId])
  const [busy, setBusy] = useState(false)

  async function pick(map: LocalMap) {
    setBusy(true)
    const encounter = await createEncounter(db, map)
    void navigate(encounterEditorPath(campaignId, map.id, encounter.id))
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      {!wide ? (
        <>
          <p className="font-semibold">{de.editor.narrowTitle}</p>
          <p className="text-dim">{t.narrow}</p>
        </>
      ) : maps === undefined ? (
        <Loading />
      ) : (
        <MapList
          maps={maps.filter((m) => m.archivedAt === null)}
          busy={busy}
          onPick={pick}
          campaignId={campaignId}
        />
      )}
    </Modal>
  )
}

function MapList({
  maps,
  busy,
  onPick,
  campaignId,
}: {
  maps: LocalMap[]
  busy: boolean
  onPick: (map: LocalMap) => Promise<void>
  campaignId: string
}) {
  if (maps.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-dim">{t.noMaps}</p>
        <ButtonLink to={mapListPath(campaignId)}>{de.maps.campaignLink}</ButtonLink>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-dim">{t.help}</p>
      <ul className="flex flex-col divide-y divide-line">
        {maps.map((map) => (
          <li key={map.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{map.name}</span>
              <span className="text-sm text-dim">
                {de.encounters.gridSize(
                  map.width,
                  map.height,
                  formatMeters(map.width),
                  formatMeters(map.height),
                )}
              </span>
            </div>
            <Button disabled={busy} onClick={() => void onPick(map)}>
              {t.pick}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
