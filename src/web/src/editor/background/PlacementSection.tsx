// The parts of the "Hintergrund" panel that change the map itself, so they also work
// offline (knowledge/features/dm-map-editor.md, "Background"): placing the picked picture
// (reset, two-point calibration) and how the grid is drawn over it.
import { useId } from 'react'
import type { MapGridStyle } from '../../api/types'
import { inputClass } from '../../components/styles'
import { Button } from '../../components/ui'
import { de } from '../../text/de'
import { useEditor, useEditorStore } from '../store'
import { placementFor } from './backgrounds'
import { startCalibration, stopCalibration, useCalibration } from './tool'
import { normaliseAngle } from './transform'

const t = de.maps.background

const one = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Shown while the map has a picked picture: what the handles do, reset and calibration. */
export function PlacementSection() {
  const store = useEditorStore()
  const background = useEditor((s) => s.background)
  const visible = useEditor((s) => s.backgroundVisible)
  const stored = useEditor((s) => s.doc.backgroundPlacement ?? null)
  const calibrating = useCalibration((s) => s.active)
  const step = useCalibration((s) => s.points.length)
  const failed = useCalibration((s) => s.failed)
  if (!background) return null

  const placement = placementFor(background, stored)
  const adjusted = stored?.assetId === background.id

  return (
    <section aria-label={t.place.title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t.place.title}</h3>
      {!visible ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-dim">{t.place.hidden}</p>
          <Button
            className="min-h-9 px-3 text-sm"
            onClick={() => store.getState().setBackgroundVisible(true)}
          >
            {t.place.show}
          </Button>
        </div>
      ) : calibrating ? (
        <>
          <p role="status" className="text-sm text-parchment">
            {t.place.steps[step] ?? ''}
          </p>
          <div>
            <Button className="min-h-9 px-3 text-sm" onClick={() => stopCalibration(store)}>
              {t.place.cancel}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-dim">{t.place.help}</p>
          <p className="text-xs text-dim tabular-nums">
            {t.place.state(
              one.format(normaliseAngle(placement.rotation)),
              one.format(placement.width),
              one.format(placement.height),
            )}
          </p>
          {failed && (
            <p role="alert" className="text-sm text-red-300">
              {t.place.failed}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-9 px-3 text-sm" onClick={() => startCalibration(store)}>
              {t.place.calibrate}
            </Button>
            <Button
              className="min-h-9 px-3 text-sm"
              disabled={!adjusted}
              title={t.place.resetHint}
              onClick={() =>
                store.getState().apply((doc) => ({ ...doc, backgroundPlacement: null }))
              }
            >
              {t.place.reset}
            </Button>
          </div>
          <p className="text-xs text-dim">{t.place.calibrateHint}</p>
        </>
      )}
    </section>
  )
}

const GRID_STYLES: MapGridStyle[] = ['normal', 'faint', 'hidden']

/** How the board draws the grid over the picture: normal, faint or not at all. */
export function GridStyleField() {
  const id = useId()
  const hintId = useId()
  const gridStyle = useEditor((s) => s.doc.gridStyle ?? 'normal')
  const apply = useEditor((s) => s.apply)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {t.grid.label}
      </label>
      <select
        id={id}
        aria-describedby={hintId}
        value={gridStyle}
        onChange={(e) => {
          const next = e.target.value as MapGridStyle
          apply((doc) => ((doc.gridStyle ?? 'normal') === next ? doc : { ...doc, gridStyle: next }))
        }}
        className={`${inputClass} min-h-9 py-1 text-sm`}
      >
        {GRID_STYLES.map((style) => (
          <option key={style} value={style}>
            {t.grid[style]}
          </option>
        ))}
      </select>
      <p id={hintId} className="text-xs text-dim">
        {t.grid.hint}
      </p>
    </div>
  )
}
