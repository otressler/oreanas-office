// The editor header's sync mark and file export.
import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router'
import { downloadMapFile } from '../../maps/mapFile'
import { SyncMark } from '../../maps/SyncMark'
import { useLocalUser } from '../../offline/localUser'
import { de } from '../../text/de'
import { useEditorStore } from '../store'

const t = de.maps.scene

/** "Nur auf diesem Gerät" while the open map isn't synced; follows every save. */
export function SyncMarkItem() {
  const { mapId = '' } = useParams()
  const { db } = useLocalUser()
  const sync = useLiveQuery(async () => (await db.maps.get(mapId))?.sync ?? null, [db, mapId])
  return sync ? <SyncMark sync={sync} /> : null
}

/** Downloads the map as a map file (the import-file format, without creatures). */
export function ExportButton() {
  const store = useEditorStore()
  return (
    <button
      type="button"
      title={t.exportTitle}
      onClick={() => downloadMapFile(store.getState().doc)}
      className="min-h-9 rounded-lg border border-line px-3 text-sm hover:border-candle"
    >
      {t.export}
    </button>
  )
}
