// The session DM's fog mode at the table (knowledge/features/fog-of-war.md, "During the
// fight"): the tools "Bereich", "Pinsel" and "Rechteck", "Aufdecken" or "Verdecken", and the
// confirm bar. A change is a preview first; "12 Felder aufdecken?" with the verb's button and
// "Abbrechen". Nothing is sent before the DM confirms.
import type { ReactNode } from 'react'
import type { FogArea } from '../api/types'
import { Button } from '../components/ui'
import { de } from '../text/de'
import { barOpen, type FogDraft, type FogTool } from './draft'

const t = de.fog.board

const TOOLS: FogTool[] = ['area', 'brush', 'rect']

/** The one-line hint under the tools, by what the tool waits for. */
export function fogHint(draft: FogDraft): string {
  if (draft.tool === 'area') return t.hints.area
  if (draft.tool === 'brush') return t.hints.brush
  return draft.corner ? t.hints.rectSecond : t.hints.rectFirst
}

export function FogBar({
  draft,
  count,
  connected,
  busy,
  error,
  noArea,
  bottom,
  onTool,
  onDirection,
  onChooseArea,
  onConfirm,
  onCancel,
}: {
  draft: FogDraft
  /** The cells that would really change. */
  count: number
  connected: boolean
  busy: boolean
  error: string | null
  /** The last area tap hit no area. */
  noArea: boolean
  /** CSS pixels from the board's bottom edge: above the docked card. */
  bottom: number
  onTool: (tool: FogTool) => void
  onDirection: (reveal: boolean) => void
  onChooseArea: (area: FogArea) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const open = barOpen(draft)
  return (
    <section
      aria-label={t.toolsLabel}
      data-testid="fog-bar"
      style={{ bottom: bottom + 12 }}
      className="absolute inset-x-0 z-30 mx-auto flex w-[calc(100%-1.5rem)] max-w-lg flex-col gap-2 rounded-xl border border-line bg-panel/95 p-2 shadow-lg shadow-black/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segments label={t.toolsLabel}>
          {TOOLS.map((tool) => (
            <Segment key={tool} on={draft.tool === tool} onClick={() => onTool(tool)}>
              {t.tools[tool]}
            </Segment>
          ))}
        </Segments>
        <Segments label={t.directionLabel}>
          <Segment on={draft.reveal} onClick={() => onDirection(true)}>
            {t.reveal}
          </Segment>
          <Segment on={!draft.reveal} onClick={() => onDirection(false)}>
            {t.hide}
          </Segment>
        </Segments>
      </div>

      {draft.choose ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-parchment">{t.chooseArea}</p>
          <div className="flex flex-wrap gap-2">
            {draft.choose.areas.map((area) => (
              <Button key={area.id} onClick={() => onChooseArea(area)}>
                {area.name}
              </Button>
            ))}
          </div>
        </div>
      ) : open ? (
        <div className="flex flex-wrap items-center gap-2">
          <p aria-live="polite" className="min-w-0 flex-1 basis-40 text-sm text-parchment">
            {count === 0
              ? t.nothingToChange
              : draft.reveal
                ? t.confirmReveal(count)
                : t.confirmHide(count)}
          </p>
          <Button
            variant="primary"
            disabled={!connected || busy || count === 0}
            onClick={onConfirm}
          >
            {draft.reveal ? t.reveal : t.hide}
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-dim">{noArea ? t.noArea : fogHint(draft)}</p>
      )}
      {!connected && open && <p className="text-sm text-dim">{de.fog.needsConnection}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}

function Segments({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 overflow-hidden rounded-lg border border-line"
    >
      {children}
    </div>
  )
}

function Segment({
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
      className={`min-h-11 px-3 text-sm ${on ? 'bg-candle font-semibold text-table' : 'text-parchment hover:text-candle'}`}
    >
      {children}
    </button>
  )
}
