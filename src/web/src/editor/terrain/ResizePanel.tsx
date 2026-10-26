// The "Größe" side panel: the map's size, and adding or removing columns and rows at
// any edge (knowledge/features/dm-map-editor.md, requirement 1). One undo step.
import { useId, useState } from 'react'
import { Button } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { limits } from '../../lib/limits'
import { formatMeters } from '../../lib/units'
import { de } from '../../text/de'
import { placementFor } from '../background/backgrounds'
import { useEditor } from '../store'
import {
  canResize,
  parseEdge,
  resizedSize,
  resizeLosses,
  resizeMap,
  type ResizeEdges,
} from './layout'

const t = de.editorTerrain.resize

type Edge = keyof ResizeEdges
const EDGES: Edge[] = ['left', 'right', 'top', 'bottom']
const ZERO: Record<Edge, string> = { left: '0', right: '0', top: '0', bottom: '0' }

export function ResizePanel() {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)
  const background = useEditor((s) => s.background)
  const [inputs, setInputs] = useState(ZERO)
  const hintId = useId()

  const parsed = EDGES.map((edge) => parseEdge(inputs[edge]))
  const whole = parsed.every((n) => n !== null)
  const edges: ResizeEdges | null = whole
    ? { left: parsed[0]!, right: parsed[1]!, top: parsed[2]!, bottom: parsed[3]! }
    : null
  const changes = edges !== null && EDGES.some((edge) => edges[edge] !== 0)
  const valid = edges !== null && canResize(doc, edges)
  const after = edges && resizedSize(doc, edges)
  const losses = valid && changes ? resizeLosses(doc, edges) : null

  const submit = () => {
    if (!edges || !valid || !changes) return
    // An upload survives the resize: its frame becomes a placement first, so it can shift
    // along with the cells (a generated picture is outdated by the new size anyway).
    apply((current) =>
      resizeMap(
        background?.origin === 'uploaded'
          ? {
              ...current,
              backgroundPlacement: placementFor(background, current.backgroundPlacement),
            }
          : current,
        edges,
      ),
    )
    setInputs(ZERO)
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <p className="text-sm text-parchment">
        <span className="tabular-nums">{t.cells(doc.width, doc.height)}</span>
        <span className="block text-dim tabular-nums">
          {t.meters(formatMeters(doc.width), formatMeters(doc.height))}
        </span>
      </p>
      <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
        <legend className="mb-1 text-sm text-dim">{t.edges}</legend>
        <div className="grid grid-cols-2 gap-2">
          {EDGES.map((edge) => (
            <EdgeInput
              key={edge}
              label={t[edge]}
              value={inputs[edge]}
              invalid={parseEdge(inputs[edge]) === null}
              onChange={(value) => setInputs((current) => ({ ...current, [edge]: value }))}
            />
          ))}
        </div>
        <p id={hintId} className="text-xs text-dim">
          {t.hint}
        </p>
      </fieldset>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm">
        {!whole ? (
          <p className="text-red-300">{t.notWhole}</p>
        ) : !valid ? (
          <p className="text-red-300">{t.outOfRange(limits.mapSize)}</p>
        ) : changes && after ? (
          <p className="text-parchment tabular-nums">{t.after(after.width, after.height)}</p>
        ) : null}
        {losses && losses.features + losses.entrances > 0 && (
          <p className="text-candle">{t.losses(losses.features, losses.entrances)}</p>
        )}
      </div>
      <div>
        <Button type="submit" disabled={!valid || !changes}>
          {t.apply}
        </Button>
      </div>
    </form>
  )
}

function EdgeInput({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-invalid={invalid || undefined}
        className={`${inputClass} tabular-nums`}
      />
    </div>
  )
}
