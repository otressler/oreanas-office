// /kampagnen/:campaignId/karten — the campaign's maps in this browser
// (knowledge/features/dm-map-editor.md, requirement 11; knowledge/domain/battle-map.md,
// "Map list, archive and store"). Works offline and never asks the server. Maps are
// archived and brought back, never deleted. On small screens the list is read-only.
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Button,
  ButtonLink,
  ErrorAlert,
  Loading,
  Note,
  PageTitle,
  Panel,
  TextField,
} from '../components/ui'
import { createMap, duplicateMap, listMaps, setArchived } from '../editor/maps'
import { DEFAULT_MAP_SIZE, emptyMap, MIN_MAP_SIZE, type LocalMap } from '../editor/model'
import { editorPath } from '../editor/paths'
import { formatDateTime } from '../lib/dates'
import { limits } from '../lib/limits'
import { formatMeters } from '../lib/units'
import { useWideScreen } from '../lib/useWideScreen'
import { useCampaignCopy } from '../offline/campaigns'
import { useLocalUser } from '../offline/localUser'
import { de } from '../text/de'
import { checkLayout } from '../editor/validation'
import { SyncStatusView, useOnline } from '../sync'
import { MapStoreDialog } from './MapStoreDialog'
import { MapFileError, parseMapFile } from './mapFile'
import { copyName, parseSize } from './fields'
import { keepStorage } from './storage'
import { SyncMark } from './SyncMark'

const t = de.maps

/** What the last action did: a note, or an error to show. */
type Outcome = { note: string } | { error: string } | null

export function MapListPage() {
  const { campaignId = '' } = useParams()
  const { db } = useLocalUser()
  const wide = useWideScreen()
  const campaign = useCampaignCopy(db, campaignId)
  const maps = useLiveQuery(() => listMaps(db, campaignId), [db, campaignId])
  const [outcome, setOutcome] = useState<Outcome>(null)

  if (campaign === undefined || maps === undefined) return <Loading />
  if (campaign === null) {
    return <Message campaignId={campaignId} title={t.unknownTitle} body={t.unknownBody} />
  }
  if (campaign.myRole !== 'dm') {
    return <Message campaignId={campaignId} title={t.notDmTitle} body={t.notDmBody} />
  }

  const active = maps.filter((map) => map.archivedAt === null)
  const archived = maps.filter((map) => map.archivedAt !== null)

  /** Runs a change on this device and reports what happened. */
  async function run(change: () => Promise<string>) {
    setOutcome(null)
    try {
      setOutcome({ note: await change() })
    } catch (error) {
      setOutcome({ error: error instanceof MapFileError ? error.message : t.actionFailed })
    }
  }

  const actions = wide
    ? {
        duplicate: (map: LocalMap) =>
          run(async () => {
            const copy = await duplicateMap(db, map.id, copyName(map.name))
            return t.duplicated(copy.name)
          }),
        archive: (map: LocalMap) =>
          run(async () => {
            await setArchived(db, map.id, true)
            return t.archived(map.name)
          }),
        restore: (map: LocalMap) =>
          run(async () => {
            await setArchived(db, map.id, false)
            return t.restored(map.name)
          }),
      }
    : null

  return (
    <div className="flex flex-col pb-8">
      <BackLink campaignId={campaignId} />
      <PageTitle>{t.title(campaign.name)}</PageTitle>
      <p className="text-dim">{t.intro}</p>
      <div className="mt-2">
        <SyncStatusView />
      </div>

      {!wide && (
        <div className="mt-4 flex flex-col gap-1 rounded-lg border border-candle/40 bg-candle/10 px-3 py-2 text-sm">
          <p className="font-semibold text-parchment">{de.editor.narrowTitle}</p>
          <p className="text-parchment">{de.editor.narrowBody}</p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 empty:hidden" aria-live="polite">
        {outcome && 'note' in outcome && <Note>{outcome.note}</Note>}
        {outcome && 'error' in outcome && <ErrorAlert error={outcome.error} />}
      </div>

      <Panel title={t.activeTitle}>
        {active.length === 0 ? (
          <p className="text-dim">{t.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {active.map((map) => (
              <MapRow key={map.id} map={map}>
                {actions && (
                  <>
                    <ButtonLink
                      variant="primary"
                      to={editorPath(campaignId, map.id)}
                      aria-label={t.editMap(map.name)}
                    >
                      {t.edit}
                    </ButtonLink>
                    <ActionButton
                      label={t.duplicateMap(map.name)}
                      onClick={() => actions.duplicate(map)}
                    >
                      {t.duplicate}
                    </ActionButton>
                    <ActionButton
                      label={t.archiveMap(map.name)}
                      onClick={() => actions.archive(map)}
                    >
                      {t.archive}
                    </ActionButton>
                  </>
                )}
              </MapRow>
            ))}
          </ul>
        )}
      </Panel>

      {archived.length > 0 && (
        <details className="mt-4 rounded-xl border border-line bg-panel p-4">
          <summary className="cursor-pointer text-lg font-semibold text-parchment">
            {t.archivedTitle(archived.length)}
          </summary>
          <p className="mt-2 text-sm text-dim">{t.archivedHint}</p>
          <ul className="flex flex-col divide-y divide-line">
            {archived.map((map) => (
              <MapRow key={map.id} map={map}>
                {actions && (
                  <ActionButton label={t.restoreMap(map.name)} onClick={() => actions.restore(map)}>
                    {t.restore}
                  </ActionButton>
                )}
              </MapRow>
            ))}
          </ul>
        </details>
      )}

      {wide && (
        <>
          <NewMapForm campaignId={campaignId} />
          <StorePanel
            campaignId={campaignId}
            local={campaign.local}
            onAdded={(name) => setOutcome({ note: de.sync.store.added(name) })}
          />
          <ImportPanel campaignId={campaignId} onDone={(result) => setOutcome(result)} />
        </>
      )}
    </div>
  )
}

function BackLink({ campaignId }: { campaignId: string }) {
  return (
    <Link
      to={`/kampagnen/${campaignId}`}
      className="pt-4 text-sm text-candle underline-offset-4 hover:underline"
    >
      <span aria-hidden="true">← </span>
      {t.back}
    </Link>
  )
}

function Message({ campaignId, title, body }: { campaignId: string; title: string; body: string }) {
  return (
    <div className="flex flex-col pb-8">
      <BackLink campaignId={campaignId} />
      <PageTitle>{title}</PageTitle>
      <p className="text-dim">{body}</p>
    </div>
  )
}

function MapRow({ map, children }: { map: LocalMap; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-semibold break-words text-parchment">{map.name}</span>
        <SyncMark sync={map.sync} />
      </div>
      <p className="text-sm text-dim">
        {t.size(map.width, map.height, formatMeters(map.width), formatMeters(map.height))}
        {' · '}
        {t.changedAt(formatDateTime(map.updatedAt))}
      </p>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </li>
  )
}

/** A row button that can't be pressed twice while its change runs. */
function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => Promise<void>
  children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      aria-label={label}
      busy={busy}
      onClick={() => {
        setBusy(true)
        void onClick().finally(() => setBusy(false))
      }}
    >
      {children}
    </Button>
  )
}

function NewMapForm({ campaignId }: { campaignId: string }) {
  const { db } = useLocalUser()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [width, setWidth] = useState(String(DEFAULT_MAP_SIZE.width))
  const [height, setHeight] = useState(String(DEFAULT_MAP_SIZE.height))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const w = parseSize(width)
  const h = parseSize(height)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t.nameRequired)
      return
    }
    if (w === null || h === null) {
      setError(t.sizeInvalid(limits.mapSize))
      return
    }
    setError(null)
    setBusy(true)
    try {
      const map = await createMap(db, campaignId, emptyMap(trimmed, w, h))
      keepStorage()
      void navigate(editorPath(campaignId, map.id))
    } catch {
      setError(t.actionFailed)
      setBusy(false)
    }
  }

  return (
    <Panel title={t.newTitle}>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <TextField
          label={t.name}
          value={name}
          maxLength={limits.mapName}
          placeholder={t.namePlaceholder}
          autoComplete="off"
          required
          invalid={error === t.nameRequired}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t.width}
            type="number"
            inputMode="numeric"
            min={MIN_MAP_SIZE}
            max={limits.mapSize}
            value={width}
            invalid={w === null}
            onChange={(event) => setWidth(event.target.value)}
          />
          <TextField
            label={t.height}
            type="number"
            inputMode="numeric"
            min={MIN_MAP_SIZE}
            max={limits.mapSize}
            value={height}
            invalid={h === null}
            onChange={(event) => setHeight(event.target.value)}
          />
        </div>
        <p className="text-sm text-dim">
          {w !== null && h !== null
            ? t.sizeHint(`${formatMeters(w)} × ${formatMeters(h)}`)
            : t.sizeInvalid(limits.mapSize)}
        </p>
        <ErrorAlert error={error} />
        <Button type="submit" variant="primary" busy={busy} className="self-start">
          {t.create}
        </Button>
      </form>
    </Panel>
  )
}

/** The map store needs the server: offline, and for a campaign it doesn't know, it only hints. */
function StorePanel({
  campaignId,
  local,
  onAdded,
}: {
  campaignId: string
  local: boolean
  onAdded: (name: string) => void
}) {
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const blocked = !online || local
  return (
    <Panel title={de.sync.store.title}>
      <p className="text-sm text-dim">
        {!online
          ? de.sync.store.offlineHint
          : local
            ? de.sync.store.localHint
            : de.sync.store.intro}
      </p>
      <Button className="self-start" disabled={blocked} onClick={() => setOpen(true)}>
        {de.sync.store.open}
      </Button>
      {open && (
        <MapStoreDialog campaignId={campaignId} onAdded={onAdded} onClose={() => setOpen(false)} />
      )}
    </Panel>
  )
}

function ImportPanel({
  campaignId,
  onDone,
}: {
  campaignId: string
  onDone: (outcome: Outcome) => void
}) {
  const { db } = useLocalUser()
  const [busy, setBusy] = useState(false)

  async function importFile(file: File) {
    setBusy(true)
    onDone(null)
    try {
      const map = parseMapFile(await file.text())
      await createMap(db, campaignId, map)
      keepStorage()
      // Imported as it is: the DM fixes rule breaks in the editor, which lists them.
      const problems = checkLayout(map).length
      onDone({ note: problems ? t.importedWithProblems(map.name, problems) : t.imported(map.name) })
    } catch (error) {
      onDone({ error: error instanceof MapFileError ? error.message : t.file.unreadable })
    } finally {
      setBusy(false)
    }
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Picking the same file again after fixing it should import again.
    event.target.value = ''
    if (file) void importFile(file)
  }

  return (
    <Panel title={t.importTitle}>
      <p className="text-sm text-dim">{t.importBody}</p>
      <label
        className={`flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line px-4 py-4 text-center font-semibold text-parchment focus-within:border-candle hover:border-candle ${busy ? 'opacity-60' : ''}`}
      >
        {t.importLabel}
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          disabled={busy}
          onChange={onInput}
        />
      </label>
    </Panel>
  )
}
