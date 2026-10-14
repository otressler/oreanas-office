// The side panels of the terrain and elevation tools: which terrain to paint, and
// which elevation.
import { useId, useState } from 'react'
import type { Terrain } from '../../api/types'
import { TERRAIN_COLORS } from '../../board/palette'
import { inputClass } from '../../components/styles'
import { limits } from '../../lib/limits'
import { formatElevation } from '../../lib/units'
import { de } from '../../text/de'
import { useEditor } from '../store'
import { formatElevationInput, parseElevationInput } from '../../lib/units'
import { ELEVATION_QUICK, TERRAIN_CHOICES, usePaintOptions } from './options'

const t = de.editorTerrain

const TOOL_HINTS: Record<string, string> = {
  'terrain-brush': t.toolHints.brush,
  'terrain-rect': t.toolHints.rect,
  'terrain-fill': t.toolHints.fill,
  'elevation-brush': t.toolHints.elevationBrush,
  'elevation-rect': t.toolHints.elevationRect,
}

function ToolHint() {
  const toolId = useEditor((s) => s.toolId)
  const hint = TOOL_HINTS[toolId]
  return hint ? <p className="text-sm text-parchment">{hint}</p> : null
}

const choiceClass = (active: boolean) =>
  `flex min-h-9 items-center gap-2 rounded-lg border px-2 text-left text-sm ${
    active
      ? 'border-candle bg-candle/15 text-candle'
      : 'border-line text-parchment hover:border-candle'
  }`

function Swatch({ terrain }: { terrain: Terrain }) {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 rounded-sm border border-line"
      style={
        terrain === 'void'
          ? {
              background:
                'repeating-linear-gradient(45deg, transparent 0 3px, rgba(236,230,216,0.35) 3px 4px)',
            }
          : { background: TERRAIN_COLORS[terrain] }
      }
    />
  )
}

export function TerrainPanel() {
  const terrain = usePaintOptions((s) => s.terrain)
  const setTerrain = usePaintOptions((s) => s.setTerrain)
  const labelId = useId()
  return (
    <div className="flex flex-col gap-3">
      <ToolHint />
      <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
        <span id={labelId} className="text-sm text-dim">
          {t.terrainChoice}
        </span>
        {TERRAIN_CHOICES.map((choice, i) => (
          <button
            key={choice}
            type="button"
            aria-pressed={choice === terrain}
            onClick={() => setTerrain(choice)}
            className={choiceClass(choice === terrain)}
          >
            <Swatch terrain={choice} />
            <span className="flex-1">{t.terrains[choice]}</span>
            <kbd className="text-xs text-dim">{i + 1}</kbd>
          </button>
        ))}
      </div>
      <p className="text-xs text-dim">{t.terrainKeys}</p>
      {terrain === 'void' && <p className="text-xs text-dim">{t.voidHint}</p>}
    </div>
  )
}

const quickNumber = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export function ElevationPanel() {
  const elevation = usePaintOptions((s) => s.elevation)
  const setElevation = usePaintOptions((s) => s.setElevation)
  // What is being typed; null shows the chosen value.
  const [draft, setDraft] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const invalid = draft !== null && parseElevationInput(draft) === null

  const change = (text: string) => {
    setDraft(text)
    const meters = parseElevationInput(text)
    if (meters !== null) setElevation(meters)
  }

  return (
    <div className="flex flex-col gap-3">
      <ToolHint />
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm text-dim">
          {t.elevation}
        </label>
        <input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          value={draft ?? formatElevationInput(elevation)}
          onChange={(e) => change(e.target.value)}
          onBlur={() => setDraft(null)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={inputClass}
        />
        {invalid && (
          <p id={errorId} role="alert" className="text-sm text-red-300">
            {t.elevationInvalid(formatElevation(limits.elevation))}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-dim">{t.elevationQuick}</span>
        <div className="grid grid-cols-5 gap-1">
          {ELEVATION_QUICK.map((meters) => (
            <button
              key={meters}
              type="button"
              aria-pressed={draft === null && meters === elevation}
              aria-label={formatElevation(meters)}
              onClick={() => {
                setDraft(null)
                setElevation(meters)
              }}
              className={`${choiceClass(draft === null && meters === elevation)} justify-center px-1 tabular-nums`}
            >
              {quickNumber.format(meters)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-dim">{t.elevationKeys}</p>
    </div>
  )
}
