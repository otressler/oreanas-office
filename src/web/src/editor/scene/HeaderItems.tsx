// The editor's sync mark (status bar) and file export (header).
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
      aria-label={t.export}
      title={t.exportTitle}
      onClick={() => downloadMapFile(store.getState().doc)}
      className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-line hover:border-candle"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-5"
      >
        <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
      </svg>
    </button>
  )
}
