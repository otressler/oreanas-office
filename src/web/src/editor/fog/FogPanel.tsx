// The "Nebel" tool's side panel (knowledge/features/fog-of-war.md, "Preparing"): fog on or off
// for the encounter, the painting shape and "Aufdecken" / "Verdecken", "Alles aufdecken", the
// named areas (create from the chosen cells, rename, redraw, delete; a click highlights one
// on the canvas) and the Prüfung note for an entrance lying entirely in fog.
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { areaCells, cleanAreaName, hiddenOfDocument, playableCells } from '../../fog/cells'
import { de } from '../../text/de'
import { useEncounter, useEncounterStore } from '../encounter/store'
import { useEditor } from '../store'
import { useFogOptions, type FogShape } from './options'
import {
  createArea,
  deleteDocArea,
  entrancesInFog,
  hideAll,
  redrawDocArea,
  renameDocArea,
  revealAll,
  turnFogOff,
  turnFogOn,
} from './ops'

const t = de.fog.editor

const SHAPES: FogShape[] = ['brush', 'rect', 'fill']

export function FogPanel() {
  const store = useEncounterStore()
  const fog = useEncounter((s) => s.doc.fog)
  const readOnly = useEncounter((s) => s.meta.readOnly)
  const map = useEditor((s) => s.doc)
  const playable = useMemo(() => playableCells(map), [map])
  const options = useFogOptions()

  if (!fog) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-dim">{t.turnOnHelp}</p>
        <div>
          <Button
            variant="primary"
            disabled={readOnly}
            onClick={() => store.getState().apply((doc) => turnFogOn(doc, playable))}
          >
            {t.turnOn}
          </Button>
        </div>
      </div>
    )
  }

  const hidden = hiddenOfDocument(fog).size
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-parchment">{t.counts(hidden, playable.size)}</p>
        <Group label={t.shapesLabel}>
          {SHAPES.map((shape) => (
            <Choice
              key={shape}
              on={options.shape === shape}
              onClick={() => options.setShape(shape)}
            >
              {t.shapes[shape]}
            </Choice>
          ))}
        </Group>
        <Group label={t.modeLabel}>
          <Choice on={options.reveal} onClick={() => options.setReveal(true)}>
            {t.reveal}
          </Choice>
          <Choice on={!options.reveal} onClick={() => options.setReveal(false)}>
            {t.hide}
          </Choice>
        </Group>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={readOnly || hidden === 0}
            onClick={() => store.getState().apply(revealAll)}
          >
            {t.revealAll}
          </Button>
          <Button
            disabled={readOnly || hidden === playable.size}
            onClick={() => store.getState().apply((doc) => hideAll(doc, playable))}
          >
            {t.hideAll}
          </Button>
        </div>
        <p className="text-sm text-dim">{t.help}</p>
      </div>

      <Areas playable={playable} readOnly={readOnly} />
      <FogChecks />

      <div>
        <Button disabled={readOnly} onClick={() => store.getState().apply(turnFogOff)}>
          {t.turnOff}
        </Button>
      </div>
    </div>
  )
}

function Areas({ playable, readOnly }: { playable: ReadonlySet<string>; readOnly: boolean }) {
  const store = useEncounterStore()
  const areas = useEncounter((s) => s.doc.fog?.areas ?? [])
  const options = useFogOptions()
  const nameId = useId()
  const [name, setName] = useState('')
  const clean = cleanAreaName(name)
  const chosen = options.selection.size

  return (
    <section aria-label={t.areas} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-dim uppercase">{t.areas}</h3>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          checked={options.selecting}
          onChange={(event) => options.setSelecting(event.target.checked)}
        />
        {t.selectCells}
      </label>
      {options.selecting && <p className="text-sm text-dim">{t.selectCellsHelp}</p>}
      {chosen > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-parchment">{t.selectionCount(chosen)}</span>
          <Button variant="quiet" onClick={() => options.setSelection(new Set())}>
            {t.clearSelection}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-sm text-dim">
          {t.areaName}
        </label>
        <input
          id={nameId}
          className={inputClass}
          value={name}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        {name !== '' && clean === null && (
          <p className="text-sm text-red-300">{t.areaNameInvalid}</p>
        )}
      </div>
      <div>
        <Button
          disabled={readOnly || clean === null || chosen === 0}
          onClick={() => {
            store.getState().apply((doc) => createArea(doc, name, options.selection, playable))
            setName('')
            options.setSelection(new Set())
          }}
        >
          {t.createArea}
        </Button>
      </div>

      {areas.length === 0 ? (
        <p className="text-sm text-dim">{t.noAreas}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {areas.map((area) => (
            <AreaRow
              key={area.id}
              id={area.id}
              name={area.name}
              cells={areaCells(area).size}
              playable={playable}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function AreaRow({
  id,
  name,
  cells,
  playable,
  readOnly,
}: {
  id: string
  name: string
  cells: number
  playable: ReadonlySet<string>
  readOnly: boolean
}) {
  const store = useEncounterStore()
  const options = useFogOptions()
  const [draft, setDraft] = useState<string | null>(null)
  const on = options.highlighted === id
  const commit = () => {
    if (draft !== null) store.getState().apply((doc) => renameDocArea(doc, id, draft))
    setDraft(null)
  }
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line p-2">
      {draft === null ? (
        <button
          type="button"
          aria-pressed={on}
          aria-label={t.showLabel(name)}
          onClick={() => options.highlight(on ? null : id)}
          className={`flex min-h-9 items-center justify-between gap-2 text-left ${on ? 'text-candle' : 'text-parchment'}`}
        >
          <span className="truncate font-semibold">{name}</span>
          <span className="shrink-0 text-xs text-dim">{t.areaCells(cells)}</span>
        </button>
      ) : (
        <input
          className={inputClass}
          aria-label={t.areaName}
          value={draft}
          maxLength={40}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setDraft(null)
          }}
        />
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-1">
          <Button aria-label={t.renameLabel(name)} onClick={() => setDraft(name)}>
            {t.rename}
          </Button>
          <Button
            aria-label={t.redrawLabel(name)}
            disabled={options.selection.size === 0}
            onClick={() => {
              store.getState().apply((doc) => redrawDocArea(doc, id, options.selection, playable))
              options.setSelection(new Set())
            }}
          >
            {t.redraw}
          </Button>
          <Button
            aria-label={t.deleteLabel(name)}
            onClick={() => {
              if (on) options.highlight(null)
              store.getState().apply((doc) => deleteDocArea(doc, id))
            }}
          >
            {t.delete}
          </Button>
        </div>
      )}
    </li>
  )
}

/** The Prüfung note: an entrance lying entirely in fog (characters usually start there). */
export function FogChecks() {
  const fog = useEncounter((s) => s.doc.fog)
  const layout = useEditor((s) => s.doc.layout)
  const flagged = useMemo(() => entrancesInFog(layout, fog), [layout, fog])
  if (flagged.length === 0) return null
  return (
    <section aria-label={t.checksTitle} className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-dim uppercase">{t.checksTitle}</h3>
      <ul className="flex flex-col gap-1">
        {flagged.map((entrance) => (
          <li key={entrance.id} className="text-sm text-candle">
            ⚠ {t.entranceInFog(entrance.label || t.entrance)}
          </li>
        ))}
      </ul>
      <p className="text-sm text-dim">{t.entranceInFogHint}</p>
    </section>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit overflow-hidden rounded-lg border border-line"
    >
      {children}
    </div>
  )
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-9 px-3 text-sm ${on ? 'bg-candle font-semibold text-table' : 'text-parchment hover:text-candle'}`}
    >
      {children}
    </button>
  )
}
