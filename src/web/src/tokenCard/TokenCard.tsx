// The token card (knowledge/features/token-card.md): docked along the bottom on phones and
// in the board's top-right corner on wide screens, never next to the token, so the cells
// around it stay free to move to. It shows the token's picture, label, kind, size and
// elevation, its statuses and the buttons the person may use; on a stack, a row for every
// token on the cell. It folds to one line, and closes with "✕" (the page also closes it
// with Escape and a tap on an empty cell). With nothing tapped but a cell, it shows the
// cell's terrain and elevation instead. While a token is selected for moving, its first
// line says what to do next, with "Hierhin" and "Abbrechen".
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardState, BoardToken, BoardTokenStatus } from '../api/types'
import { ringColor } from '../board/palette'
import { Button } from '../components/ui'
import { statusName } from '../statuses/names'
import {
  canAddStatus,
  canRemoveStatus,
  findDefinition,
  MAX_LEVEL,
  MIN_LEVEL,
  personName,
} from '../statuses/rules'
import { StatusIcon } from '../statuses/StatusIcon'
import type { Controls } from '../table/controls'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { tokenKind, tokenMeasures, type ShownCard } from './card'

const t = de.tokenCard

/** What the card's buttons may do right now. */
export interface CardLive {
  /** The fight runs: statuses, pings and removing are possible at all. */
  running: boolean
  /** The table is connected; without it the buttons are off and say why. */
  connected: boolean
}

export interface TokenCardProps {
  shown: ShownCard
  board: Pick<BoardState, 'isSessionDm' | 'people' | 'statuses'>
  userId: string
  /** The controls as they apply now, and the selected token, for the first line. */
  controls: Controls
  selected: BoardToken | null
  /** Top-right panel instead of the bottom sheet. */
  wide: boolean
  folded: boolean
  onFoldedChange: (folded: boolean) => void
  onClose: () => void
  /** "Hierhin" and "Abbrechen" of the selected token. */
  onConfirm: () => void
  onCancel: () => void
  live: CardLive
  canMove: (token: BoardToken) => boolean
  /** A stack's row: selects the token if the person may move it, else shows it in the card. */
  onPickRow: (token: BoardToken) => void
  onAddStatus: (token: BoardToken) => void
  onShow: (token: BoardToken) => void
  onRemoveToken: (token: BoardToken) => void
  onRemoveStatus: (token: BoardToken, statusId: string) => void
  onSetLevel: (token: BoardToken, statusId: string, level: number) => void
  /** The card's size in CSS pixels, null once it is gone: the board keeps clear of it. */
  onSize: (size: { width: number; height: number } | null) => void
  /** Stage 10, the session DM only: reveal and hide creatures (knowledge/features/fog-of-war.md). */
  fog?: CardFog
}

export interface CardFog {
  /** "Aufdecken" or "Verbergen" for these creatures. */
  onSetHidden: (tokens: BoardToken[], hidden: boolean) => void
  /** The hidden creatures in the same area or areas as the token, for "Alle verborgenen hier". */
  hiddenHere: (token: BoardToken) => BoardToken[]
}

export function TokenCard(props: TokenCardProps) {
  const { shown, wide, folded, onFoldedChange, onClose, selected, controls } = props
  const measure = useReportSize(props.onSize)
  const token = shown.kind === 'token' ? shown.token : null
  const ring = token ? ringColor(token) : null

  const place = wide
    ? 'top-3 right-3 w-80 max-h-[calc(100%-1.5rem)] rounded-xl border'
    : 'inset-x-0 bottom-0 max-h-[25vh] rounded-t-xl border-t border-x'
  return (
    <section
      ref={measure}
      aria-label={token ? t.label : t.cellLabel}
      data-testid="token-card"
      data-folded={folded || undefined}
      className={`absolute z-20 flex flex-col border-line bg-panel/95 text-parchment shadow-lg shadow-black/40 ${place}`}
    >
      {selected && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <p aria-live="polite" className="min-w-0 flex-1 basis-40 text-sm text-parchment">
            {controls.mode === 'preview'
              ? de.table.confirmHint(selected.label)
              : de.table.pickTarget(selected.label)}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {controls.mode === 'preview' && (
              <Button variant="primary" onClick={props.onConfirm}>
                {de.table.confirm}
              </Button>
            )}
            <Button variant="quiet" onClick={props.onCancel}>
              {de.table.cancel}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 px-3 py-2">
        {token && ring && (
          <TokenPicture
            url={token.imageUrl}
            label={token.label}
            ring={ring}
            alt={t.pictureAlt(token.label)}
            className={folded ? 'h-9 w-9 text-sm' : 'h-14 w-14 text-xl'}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate font-semibold text-parchment">
            {token ? token.label : shown.kind === 'cell' ? shown.info.title : null}
          </h2>
          {!folded && token && (
            <>
              <p className="truncate text-sm text-dim">{tokenKind(token, props.board.people)}</p>
              <p className="truncate text-sm text-dim">{tokenMeasures(token)}</p>
            </>
          )}
        </div>
        <button
          type="button"
          aria-label={folded ? t.unfold : t.fold}
          aria-expanded={!folded}
          onClick={() => onFoldedChange(!folded)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-dim hover:text-parchment"
        >
          <span aria-hidden="true">{folded ? '▴' : '▾'}</span>
        </button>
        <button
          type="button"
          aria-label={t.close}
          onClick={onClose}
          className="-mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-dim hover:text-parchment"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {!folded && (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3">
          {shown.kind === 'cell' ? (
            shown.info.details.map((line) => (
              <p key={line} className="text-sm text-dim">
                {line}
              </p>
            ))
          ) : (
            <>
              {shown.rows.length > 1 && <StackRows {...props} shown={shown} />}
              <TokenDetails key={shown.token.id} {...props} token={shown.token} />
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** Every token on the tapped cell, one row each, those the person may move first. */
function StackRows({
  shown,
  board,
  live,
  canMove,
  selected,
  onPickRow,
  onRemoveToken,
}: TokenCardProps & { shown: Extract<ShownCard, { kind: 'token' }> }) {
  const removable = board.isSessionDm && live.running
  return (
    <ul aria-label={t.stack(shown.rows.length)} className="flex flex-col gap-1">
      {shown.rows.map((row) => {
        const current = row.id === shown.token.id
        return (
          <li key={row.id} className="flex items-center gap-1">
            <button
              type="button"
              aria-current={current || undefined}
              aria-label={canMove(row) ? t.selectRow(row.label) : t.viewRow(row.label)}
              onClick={() => onPickRow(row)}
              className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1 text-left hover:border-candle ${
                current ? 'border-candle bg-candle/10' : 'border-line'
              }`}
            >
              <TokenPicture
                url={row.imageUrl}
                label={row.label}
                ring={ringColor(row)}
                alt=""
                className="h-8 w-8 text-sm"
              />
              <span className="min-w-0 flex-1 truncate">
                {row.label}
                {row.hidden && (
                  <span className="ml-2 text-xs text-candle">{de.fog.hiddenMark}</span>
                )}
                {selected?.id === row.id && (
                  <span className="ml-2 text-xs text-candle">{de.tokenCard.selectedMark}</span>
                )}
              </span>
              <span className="flex shrink-0 gap-0.5">
                {row.statuses.slice(0, 4).map((status) => (
                  <StatusIcon
                    key={status.statusId}
                    status={findDefinition(board.statuses, status.statusId)}
                    className="h-5 w-5 text-[0.6rem]"
                  />
                ))}
              </span>
            </button>
            {removable && (
              <button
                type="button"
                aria-label={t.removeRow(row.label)}
                title={t.removeRow(row.label)}
                disabled={!live.connected}
                onClick={() => onRemoveToken(row)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-dim hover:border-candle hover:text-parchment disabled:opacity-40"
              >
                <RemoveIcon />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** One token's statuses and the buttons the person may use on it. */
function TokenDetails({
  token,
  board,
  userId,
  live,
  onAddStatus,
  onShow,
  onRemoveToken,
  onRemoveStatus,
  onSetLevel,
  fog,
}: TokenCardProps & { token: BoardToken }) {
  const [open, setOpen] = useState<string | null>(null)
  const may = (status: BoardTokenStatus) => canRemoveStatus(status, board, userId)
  const addable = live.running && canAddStatus(token, board, userId)
  const removable = live.running && board.isSessionDm
  const off = !live.connected
  // Creatures can be hidden from the players; characters are always visible.
  const hideable = !!fog && live.running && board.isSessionDm && token.kind === 'creature'
  const hiddenHere = hideable && token.hidden ? fog.hiddenHere(token) : []

  return (
    <>
      {hideable && token.hidden && <p className="text-sm text-dim">{de.fog.token.hiddenNote}</p>}
      <section aria-label={t.statuses} className="flex flex-col gap-1">
        {token.statuses.length === 0 ? (
          <p className="text-sm text-dim">{t.noStatuses}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {token.statuses.map((status) => {
              const definition = findDefinition(board.statuses, status.statusId)
              const name = definition ? statusName(definition) : '?'
              const shownName =
                definition?.hasLevels && status.level != null
                  ? de.statuses.withLevel(name, status.level)
                  : name
              const by = de.statuses.appliedBy(
                personName(board.people, status.appliedByUserId) ?? de.statuses.someone,
              )
              const content = (
                <>
                  <StatusIcon
                    status={definition}
                    level={definition?.hasLevels ? status.level : null}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-parchment">{shownName}</span>
                    <span className="block truncate text-xs text-dim">{by}</span>
                  </span>
                </>
              )
              const changeable = live.running && may(status)
              return (
                <li key={status.statusId} className="flex flex-col gap-1">
                  {changeable ? (
                    <button
                      type="button"
                      aria-expanded={open === status.statusId}
                      onClick={() => setOpen(open === status.statusId ? null : status.statusId)}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-2 py-1 text-left hover:border-candle"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex min-h-11 items-center gap-2 px-2 py-1">{content}</div>
                  )}
                  {changeable && open === status.statusId && (
                    <div className="flex flex-wrap items-center gap-2 pl-2">
                      <Button
                        disabled={off}
                        onClick={() => {
                          setOpen(null)
                          onRemoveStatus(token, status.statusId)
                        }}
                      >
                        {t.statusRemove}
                      </Button>
                      {definition?.hasLevels && (
                        <>
                          <Button
                            aria-label={t.levelDown(name)}
                            disabled={off || (status.level ?? MIN_LEVEL) <= MIN_LEVEL}
                            onClick={() =>
                              onSetLevel(token, status.statusId, (status.level ?? MIN_LEVEL) - 1)
                            }
                          >
                            −
                          </Button>
                          <span className="text-sm tabular-nums">
                            {de.statuses.level(status.level ?? MIN_LEVEL)}
                          </span>
                          <Button
                            aria-label={t.levelUp(name)}
                            disabled={off || (status.level ?? MIN_LEVEL) >= MAX_LEVEL}
                            onClick={() =>
                              onSetLevel(token, status.statusId, (status.level ?? MIN_LEVEL) + 1)
                            }
                          >
                            +
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {live.running && (
        <div className="flex flex-wrap gap-2">
          {addable && (
            <Button disabled={off} onClick={() => onAddStatus(token)}>
              {t.addStatus}
            </Button>
          )}
          <Button disabled={off} onClick={() => onShow(token)}>
            {t.show}
          </Button>
          {hideable && (
            <Button disabled={off} onClick={() => fog.onSetHidden([token], !token.hidden)}>
              {token.hidden ? de.fog.token.reveal : de.fog.token.hide}
            </Button>
          )}
          {hiddenHere.length > 1 && (
            <Button disabled={off} onClick={() => fog?.onSetHidden(hiddenHere, false)}>
              {`${de.fog.token.revealAllHere} (${hiddenHere.length})`}
            </Button>
          )}
          {removable && (
            <Button disabled={off} onClick={() => onRemoveToken(token)}>
              <RemoveIcon />
              {t.remove}
            </Button>
          )}
        </div>
      )}
      {live.running && off && <p className="text-sm text-dim">{t.needsConnection}</p>}
    </>
  )
}

/** A token lifted off the board. */
function RemoveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="9" r="5" />
      <path d="M12 17v4M8 21h8" />
    </svg>
  )
}

/**
 * A callback ref that reports the element's size whenever it changes, and null once the
 * element is gone.
 */
function useReportSize(onSize: TokenCardProps['onSize']) {
  const latest = useRef(onSize)
  useEffect(() => {
    latest.current = onSize
  })
  const observer = useRef<ResizeObserver | null>(null)
  return useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!element) {
      latest.current(null)
      return
    }
    const measure = () =>
      latest.current({ width: element.offsetWidth, height: element.offsetHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(measure)
    observer.current.observe(element)
  }, [])
}
