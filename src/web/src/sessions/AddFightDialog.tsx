// "Kampf hinzufügen" on the session page (knowledge/features/session-planning.md, "Adding a
// fight"): a new draft fight in the session on one of the campaign's maps, on a copy of one,
// or on a new map. Everything is made on the device and synced later, like the editor's work.
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, ButtonLink, ErrorAlert, Loading, TextField } from '../components/ui'
import { createEncounter, editable } from '../editor/encounter/encounters'
import { ENCOUNTER_NAME_MAX } from '../editor/encounter/tokens'
import { createMap, duplicateMap, listMaps } from '../editor/maps'
import { DEFAULT_MAP_SIZE, emptyMap, MIN_MAP_SIZE, type LocalMap } from '../editor/model'
import { editorPath, encounterEditorPath, mapListPath } from '../editor/paths'
import { limits } from '../lib/limits'
import { formatMeters } from '../lib/units'
import { useWideScreen } from '../lib/useWideScreen'
import { copyName, parseSize } from '../maps/fields'
import { keepStorage } from '../maps/storage'
import type { OfflineDb } from '../offline/db'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'

const t = de.addFight

type Choice = keyof typeof t.choices

const HELP: Record<Choice, string> = {
  existing: t.existingHelp,
  copy: t.copyHelp,
  fresh: t.freshHelp,
}

export function AddFightButton({
  db,
  campaignId,
  sessionId,
}: {
  db: OfflineDb
  campaignId: string
  sessionId: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {de.sessionPage.addFight}
      </Button>
      {open && (
        <AddFightDialog
          db={db}
          campaignId={campaignId}
          sessionId={sessionId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function AddFightDialog({
  db,
  campaignId,
  sessionId,
  onClose,
}: {
  db: OfflineDb
  campaignId: string
  sessionId: string
  onClose: () => void
}) {
  const wide = useWideScreen()
  const [name, setName] = useState('')
  const [choice, setChoice] = useState<Choice>('existing')

  return (
    <Modal title={t.title} onClose={onClose}>
      {!wide ? (
        <>
          <p className="font-semibold">{de.editor.narrowTitle}</p>
          <p className="text-dim">{t.narrow}</p>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <TextField
            label={t.name}
            placeholder={t.namePlaceholder}
            maxLength={ENCOUNTER_NAME_MAX}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{t.title}</legend>
            {(Object.keys(t.choices) as Choice[]).map((key) => (
              <label
                key={key}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 ${
                  choice === key ? 'border-candle text-parchment' : 'border-line text-dim'
                }`}
              >
                <input
                  type="radio"
                  name="add-fight-choice"
                  value={key}
                  checked={choice === key}
                  onChange={() => setChoice(key)}
                />
                {t.choices[key]}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-dim">{HELP[choice]}</p>
          {choice === 'fresh' ? (
            <NewMap db={db} campaignId={campaignId} sessionId={sessionId} fightName={name} />
          ) : (
            <MapPick
              db={db}
              campaignId={campaignId}
              sessionId={sessionId}
              fightName={name}
              copy={choice === 'copy'}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

/** The campaign's maps on this device, with how many planned fights already use each. */
function MapPick({
  db,
  campaignId,
  sessionId,
  fightName,
  copy,
}: {
  db: OfflineDb
  campaignId: string
  sessionId: string
  fightName: string
  copy: boolean
}) {
  const navigate = useNavigate()
  const maps = useLiveQuery(() => listMaps(db, campaignId), [db, campaignId])
  const planned = useLiveQuery(
    async () =>
      (await db.encounters.where('campaignId').equals(campaignId).toArray()).filter(
        (encounter) => editable(encounter) && encounter.archivedAt === null,
      ),
    [db, campaignId],
  )
  const [busy, setBusy] = useState(false)

  if (maps === undefined || planned === undefined) return <Loading />
  const offered = maps.filter((map) => map.archivedAt === null)
  if (offered.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-dim">{t.noMaps}</p>
        <ButtonLink to={mapListPath(campaignId)}>{de.maps.campaignLink}</ButtonLink>
      </div>
    )
  }

  async function pick(map: LocalMap) {
    setBusy(true)
    const target = copy ? await duplicateMap(db, map.id, copyName(map.name)) : map
    const encounter = await createEncounter(db, target, sessionId, fightName || map.name)
    keepStorage()
    void navigate(encounterEditorPath(campaignId, target.id, encounter.id))
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {offered.map((map) => {
        const uses = planned.filter((encounter) => encounter.battleMapId === map.id).length
        return (
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
                {uses > 0 && ` · ${t.usedBy(uses)}`}
              </span>
            </div>
            <Button disabled={busy} onClick={() => void pick(map)}>
              {t.pick}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

/** A new empty map; the editor opens in map mode to draw it, the fight is in its menu. */
function NewMap({
  db,
  campaignId,
  sessionId,
  fightName,
}: {
  db: OfflineDb
  campaignId: string
  sessionId: string
  fightName: string
}) {
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
      setError(de.maps.nameRequired)
      return
    }
    if (w === null || h === null) {
      setError(de.maps.sizeInvalid(limits.mapSize))
      return
    }
    setError(null)
    setBusy(true)
    try {
      const map = await createMap(db, campaignId, emptyMap(trimmed, w, h))
      await createEncounter(db, map, sessionId, fightName)
      keepStorage()
      void navigate(editorPath(campaignId, map.id))
    } catch {
      setError(de.maps.actionFailed)
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <TextField
        label={de.maps.name}
        value={name}
        maxLength={limits.mapName}
        placeholder={de.maps.namePlaceholder}
        autoComplete="off"
        required
        invalid={error === de.maps.nameRequired}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={de.maps.width}
          type="number"
          inputMode="numeric"
          min={MIN_MAP_SIZE}
          max={limits.mapSize}
          value={width}
          invalid={w === null}
          onChange={(event) => setWidth(event.target.value)}
        />
        <TextField
          label={de.maps.height}
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
          ? de.maps.sizeHint(`${formatMeters(w)} × ${formatMeters(h)}`)
          : de.maps.sizeInvalid(limits.mapSize)}
      </p>
      <ErrorAlert error={error} />
      <Button type="submit" variant="primary" busy={busy} className="self-start">
        {t.create}
      </Button>
    </form>
  )
}
