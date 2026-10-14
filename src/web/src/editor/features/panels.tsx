// Side panels of the feature and entrance tools: the options for the next placement,
// the selection's properties (the select tool's panel) and the layout checks.
import { useId, useMemo, useState } from 'react'
import { Button, SelectField, TextField } from '../../components/ui'
import type { LayoutEntrance, LayoutFeature } from '../../api/types'
import { formatElevationInput, parseElevationInput } from '../../lib/units'
import { limits } from '../../lib/limits'
import { de } from '../../text/de'
import { useEditor, useEditorStore } from '../store'
import { checkLayout, problemTarget } from '../validation'
import { CheckField, Help, KindSuggestions, MapNumberField, MapTextField } from './fields'
import { suggestionFor } from './kinds'
import {
  footprintProblem,
  parseCellsInput,
  removeItem,
  updateEntrance,
  updateFeature,
  type EntranceKind,
} from './layout'
import { problemMessage } from './messages'
import { setEntranceOptions, setFeatureOptions, usePlacementOptions } from './options'

const t = de.editorFeatures
const ENTRANCE_KINDS = Object.keys(de.board.entranceKinds) as EntranceKind[]

/** The feature tool's options for the next feature. */
export function FeatureToolPanel() {
  const options = usePlacementOptions((s) => s.feature)
  const listId = useId()
  const [elevationDraft, setElevationDraft] = useState<string | null>(null)
  const elevationValid = elevationDraft === null || parseElevationInput(elevationDraft) !== null
  return (
    <div className="flex flex-col gap-3">
      <Help>{t.featureHelp}</Help>
      <TextField
        label={t.kind}
        value={options.kind}
        maxLength={limits.layoutText}
        list={listId}
        autoComplete="off"
        invalid={!options.kind.trim()}
        hint={options.kind.trim() ? t.kindHint : t.kindMissing}
        onChange={(e) => {
          const kind = e.target.value
          const suggestion = suggestionFor(kind)
          setFeatureOptions({
            kind,
            ...(suggestion && { blocksMovement: suggestion.blocksMovement }),
          })
        }}
      />
      <KindSuggestions id={listId} />
      <TextField
        label={t.label}
        value={options.label}
        maxLength={limits.layoutText}
        autoComplete="off"
        hint={t.featureLabelHint}
        onChange={(e) => setFeatureOptions({ label: e.target.value })}
      />
      <TextField
        label={t.elevation}
        value={elevationDraft ?? formatElevationInput(options.elevation)}
        inputMode="decimal"
        autoComplete="off"
        invalid={!elevationValid}
        hint={elevationValid ? t.elevationHint : t.elevationInvalid}
        onChange={(e) => {
          setElevationDraft(e.target.value)
          const meters = parseElevationInput(e.target.value)
          if (meters !== null) setFeatureOptions({ elevation: meters })
        }}
        onBlur={() => setElevationDraft(null)}
      />
      <CheckField
        label={t.blocksMovement}
        hint={t.blocksMovementHint}
        checked={options.blocksMovement}
        onChange={(blocksMovement) => setFeatureOptions({ blocksMovement })}
      />
    </div>
  )
}

/** The entrance tool's options for the next entrance. */
export function EntranceToolPanel() {
  const options = usePlacementOptions((s) => s.entrance)
  return (
    <div className="flex flex-col gap-3">
      <Help>{t.entranceHelp}</Help>
      <SelectField
        label={t.entranceKind}
        value={options.kind}
        onChange={(e) => setEntranceOptions({ kind: e.target.value as EntranceKind })}
      >
        {ENTRANCE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {de.board.entranceKinds[kind]}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t.label}
        value={options.label}
        maxLength={limits.layoutText}
        autoComplete="off"
        hint={t.entranceLabelHint}
        onChange={(e) => setEntranceOptions({ label: e.target.value })}
      />
    </div>
  )
}

/** The select tool's panel: the selected feature's or entrance's properties. */
export function SelectPanel() {
  const feature = useEditor((s) =>
    s.selection?.kind === 'feature'
      ? s.doc.layout.features.find((f) => f.id === s.selection!.id)
      : undefined,
  )
  const entrance = useEditor((s) =>
    s.selection?.kind === 'entrance'
      ? s.doc.layout.entrances.find((e) => e.id === s.selection!.id)
      : undefined,
  )
  if (feature) return <FeatureProperties key={feature.id} feature={feature} />
  if (entrance) return <EntranceProperties key={entrance.id} entrance={entrance} />
  return <Help>{t.selectHelp}</Help>
}

function FeatureProperties({ feature }: { feature: LayoutFeature }) {
  const store = useEditorStore()
  const listId = useId()
  const id = feature.id
  const footprintField = (key: 'x' | 'y' | 'w' | 'h', label: string) => (
    <MapNumberField
      key={key}
      label={label}
      value={feature[key]}
      inputMode="numeric"
      format={String}
      parse={parseCellsInput}
      invalidText={t.wholeNumber}
      check={(value, doc) => {
        const current = doc.layout.features.find((f) => f.id === id)
        if (!current) return null
        const problem = footprintProblem(doc, { ...current, [key]: value }, id)
        return problem === 'outside'
          ? t.footprintOutside
          : problem === 'overlap'
            ? t.footprintOverlap
            : null
      }}
      onEdit={(doc, value) => updateFeature(doc, id, { [key]: value })}
    />
  )
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-parchment">
        {t.featureTitle(feature.label || feature.kind)}
      </h3>
      <MapTextField
        label={t.kind}
        value={feature.kind}
        maxLength={limits.layoutText}
        list={listId}
        autoComplete="off"
        hint={t.kindHint}
        error={feature.kind.trim() ? null : t.kindMissing}
        onEdit={(doc, kind) => updateFeature(doc, id, { kind })}
      />
      <KindSuggestions id={listId} />
      <MapTextField
        label={t.label}
        value={feature.label}
        maxLength={limits.layoutText}
        autoComplete="off"
        hint={t.featureLabelHint}
        onEdit={(doc, label) => updateFeature(doc, id, { label })}
      />
      <MapNumberField
        label={t.elevation}
        value={feature.elevation}
        inputMode="decimal"
        format={formatElevationInput}
        parse={parseElevationInput}
        invalidText={t.elevationInvalid}
        hint={t.elevationHint}
        onEdit={(doc, elevation) => updateFeature(doc, id, { elevation })}
      />
      <CheckField
        label={t.blocksMovement}
        hint={t.blocksMovementHint}
        checked={feature.blocksMovement}
        onChange={(blocksMovement) =>
          store.getState().apply((doc) => updateFeature(doc, id, { blocksMovement }))
        }
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-dim">{t.footprint}</legend>
        <div className="grid grid-cols-2 gap-2">
          {footprintField('x', t.x)}
          {footprintField('y', t.y)}
          {footprintField('w', t.w)}
          {footprintField('h', t.h)}
        </div>
      </fieldset>
      <DeleteButton item={{ kind: 'feature', id }} />
    </div>
  )
}

function EntranceProperties({ entrance }: { entrance: LayoutEntrance }) {
  const store = useEditorStore()
  const id = entrance.id
  const kind = de.board.entranceKinds[entrance.kind]
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-parchment">{de.board.entrance(kind, entrance.label)}</h3>
      <SelectField
        label={t.entranceKind}
        value={entrance.kind}
        onChange={(e) => {
          const next = e.target.value as EntranceKind
          store.getState().apply((doc) => updateEntrance(doc, id, { kind: next }))
        }}
      >
        {ENTRANCE_KINDS.map((value) => (
          <option key={value} value={value}>
            {de.board.entranceKinds[value]}
          </option>
        ))}
      </SelectField>
      <MapTextField
        label={t.label}
        value={entrance.label}
        maxLength={limits.layoutText}
        autoComplete="off"
        hint={t.entranceLabelHint}
        onEdit={(doc, label) => updateEntrance(doc, id, { label })}
      />
      <p className="text-sm text-parchment">{t.cellCount(entrance.cells.length)}</p>
      <DeleteButton item={{ kind: 'entrance', id }} />
    </div>
  )
}

function DeleteButton({ item }: { item: { kind: 'feature' | 'entrance'; id: string } }) {
  const store = useEditorStore()
  return (
    <Button
      className="self-start"
      onClick={() => store.getState().apply((doc) => removeItem(doc, item))}
    >
      {t.delete}
    </Button>
  )
}

/** The layout checks: "Keine Probleme", or every problem; a click selects what it's about. */
export function ChecksPanel() {
  const store = useEditorStore()
  const doc = useEditor((s) => s.doc)
  const problems = useMemo(() => checkLayout(doc), [doc])
  if (problems.length === 0) return <p className="text-sm text-parchment">{t.checks.none}</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-red-200">{t.checks.count(problems.length)}</p>
      <ul className="flex flex-col gap-1">
        {problems.map((problem, i) => {
          const message = problemMessage(problem, doc)
          const target = problemTarget(problem)
          return (
            <li key={i}>
              {target ? (
                <button
                  type="button"
                  title={t.checks.selectHint}
                  className="w-full rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2 text-left text-sm text-red-100 hover:border-candle"
                  onClick={() => {
                    const state = store.getState()
                    state.setTool('select')
                    state.select(target)
                  }}
                >
                  {message}
                </button>
              ) : (
                <p className="rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                  {message}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
