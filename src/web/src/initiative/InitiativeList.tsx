// The session DM's initiative list over the board (knowledge/features/initiative.md, "The
// list"): the tokens in turn order with their values. A tap on an entry selects its token on
// the board; the handle drags it to another place, or moves it with the arrow keys. Nothing
// here is enforced: it only shows the order the DM keeps. Creatures show the hit points they
// have left and their maximum, and dead ones are dimmed (knowledge/features/hit-points.md).
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { BoardToken, InitiativeEntry } from '../api/types'
import { ringColor } from '../board/palette'
import { Button } from '../components/ui'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { moveEntry, shownEntries } from './initiative'

const t = de.initiative

/** Space between rows (Tailwind gap-1), which a dragged row also covers. */
const ROW_GAP = 4

/** A row being dragged: where it started and where it would land among the others. */
interface Drag {
  index: number
  startY: number
  dy: number
  /** Its place among the other rows if dropped now. */
  over: number
  tops: number[]
  heights: number[]
}

export function InitiativeList({
  entries,
  tokens,
  selectedId,
  connected,
  collapsed,
  onCollapsedChange,
  onSelect,
  onReorder,
  onEdit,
  onEnd,
}: {
  /** The whole list in turn order, entries of removed tokens included. */
  entries: readonly InitiativeEntry[]
  tokens: readonly BoardToken[]
  selectedId: string | null
  connected: boolean
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onSelect: (token: BoardToken) => void
  /** The whole list in its new order. */
  onReorder: (entries: InitiativeEntry[]) => void
  onEdit: () => void
  onEnd: () => void
}) {
  const shown = shownEntries(entries, tokens)
  const ids = shown.map(({ token }) => token.id)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [asking, setAsking] = useState(false)
  const [announced, setAnnounced] = useState('')

  function move(from: number, to: number) {
    if (from === to || !connected) return
    onReorder(moveEntry(entries, ids, from, to))
    const token = shown[from]?.token
    if (token) setAnnounced(t.moved(token.label, to + 1))
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (!connected || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rects = rows.current.slice(0, shown.length).map((row) => row?.getBoundingClientRect())
    setDrag({
      index,
      startY: event.clientY,
      dy: 0,
      over: index,
      tops: rects.map((rect) => rect?.top ?? 0),
      heights: rects.map((rect) => rect?.height ?? 0),
    })
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return
    const dy = event.clientY - drag.startY
    const center = drag.tops[drag.index]! + drag.heights[drag.index]! / 2 + dy
    // Its place among the others: how many of their middles it has passed.
    let over = 0
    drag.tops.forEach((top, i) => {
      if (i !== drag.index && center > top + drag.heights[i]! / 2) over += 1
    })
    setDrag({ ...drag, dy, over })
  }

  function endDrag() {
    if (!drag) return
    setDrag(null)
    move(drag.index, drag.over)
  }

  /** How far a row moves aside while another is dragged past it. */
  function shift(i: number): number {
    if (!drag || i === drag.index) return 0
    const size = drag.heights[drag.index]! + ROW_GAP
    if (i < drag.index && i >= drag.over) return size
    if (i > drag.index && i <= drag.over) return -size
    return 0
  }

  return (
    <section
      aria-labelledby="initiative-title"
      data-testid="initiative-list"
      className="pointer-events-auto flex max-h-full w-52 flex-col rounded-xl border border-line bg-panel/95 shadow-lg shadow-black/40 sm:w-60"
    >
      <div className="flex items-center gap-1 px-2 py-1">
        <h2 id="initiative-title" className="flex-1 px-1 font-semibold text-parchment">
          {t.listTitle}
        </h2>
        {!collapsed && (
          <Button variant="quiet" onClick={onEdit} disabled={!connected}>
            {t.edit}
          </Button>
        )}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t.expand : t.collapse}
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-dim hover:text-parchment"
        >
          <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        </button>
      </div>

      {!collapsed && (
        <>
          {!connected && <p className="px-3 pb-1 text-sm text-dim">{t.needsConnection}</p>}
          {shown.length === 0 ? (
            <p className="px-3 pb-2 text-sm text-dim">{t.empty}</p>
          ) : (
            <ol className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2 pb-2">
              {shown.map(({ entry, token }, index) => {
                const dragged = drag?.index === index
                const selected = token.id === selectedId
                return (
                  <li
                    key={token.id}
                    ref={(row) => {
                      rows.current[index] = row
                    }}
                    data-testid={`initiative-${token.id}`}
                    style={{
                      transform: `translateY(${drag && dragged ? drag.dy : shift(index)}px)`,
                      transition: dragged || !drag ? undefined : 'transform 120ms ease-out',
                    }}
                    className={`relative flex items-center rounded-lg border ${
                      selected ? 'border-candle bg-candle/15' : 'border-line bg-panel'
                    } ${dragged ? 'z-10 shadow-lg shadow-black/50' : ''}`}
                  >
                    <button
                      type="button"
                      aria-label={t.handle(token.label)}
                      title={t.handleHint}
                      disabled={!connected}
                      onPointerDown={(event) => startDrag(event, index)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' && index > 0) {
                          event.preventDefault()
                          move(index, index - 1)
                        } else if (event.key === 'ArrowDown' && index < shown.length - 1) {
                          event.preventDefault()
                          move(index, index + 1)
                        }
                      }}
                      className="flex min-h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-dim hover:text-parchment disabled:cursor-default"
                    >
                      <GripIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={t.select(token.label, entry.value)}
                      aria-current={selected || undefined}
                      onClick={() => onSelect(token)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left"
                    >
                      <span className="w-7 shrink-0 text-right font-semibold text-candle tabular-nums">
                        {entry.value ?? t.noValue}
                      </span>
                      <TokenPicture
                        url={token.imageUrl}
                        label={token.label}
                        ring={ringColor(token)}
                        alt=""
                        className="h-7 w-7 text-xs"
                      />
                      <span
                        className={`min-w-0 flex-1 truncate ${token.hidden ? 'text-dim italic' : token.dead ? 'text-dim line-through' : 'text-parchment'}`}
                      >
                        {token.label}
                      </span>
                      {token.dead ? (
                        <span className="shrink-0 text-xs text-candle">{t.dead}</span>
                      ) : (
                        token.hitPoints != null &&
                        token.maxHitPoints != null && (
                          <span
                            aria-label={t.hitPointsLabel(token.hitPoints, token.maxHitPoints)}
                            className={`shrink-0 text-xs tabular-nums ${token.hitPoints === 0 ? 'text-red-300' : 'text-dim'}`}
                          >
                            {t.hitPoints(token.hitPoints, token.maxHitPoints)}
                          </span>
                        )
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="border-t border-line px-2 py-1">
            {asking ? (
              <div className="flex flex-col gap-1 py-1">
                <span className="px-1 text-sm text-parchment">{t.endQuestion}</span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    disabled={!connected}
                    onClick={() => {
                      setAsking(false)
                      onEnd()
                    }}
                  >
                    {t.endConfirm}
                  </Button>
                  <Button variant="quiet" onClick={() => setAsking(false)}>
                    {t.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="quiet" disabled={!connected} onClick={() => setAsking(true)}>
                {t.end}
              </Button>
            )}
          </div>
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
    </section>
  )
}

/** Two columns of dots: something to grab. */
function GripIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" />
          <circle cx="15" cy={y} r="1.6" />
        </g>
      ))}
    </svg>
  )
}
