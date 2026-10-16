// Taking tokens off the board, for the session DM (knowledge/features/removing-tokens.md):
// right after "Vom Feld nehmen" a bar at the bottom of the screen offers "Rückgängig" for
// about eight seconds; later, "Vom Feld genommen" in the fight's top bar lists the removed
// tokens, newest first, each with "Zurückholen". No confirm step: a mistake is cheap.
import { useEffect } from 'react'
import type { BoardToken } from '../api/types'
import { ringColor } from '../board/palette'
import { Popover } from '../components/Popover'
import { Button } from '../components/ui'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'

const t = de.tokenCard

/** How long the undo bar stays after removing a token. */
export const UNDO_REMOVE_MS = 8_000

/** The token just taken off: shown in the undo bar until it times out or is used. */
export interface JustRemoved {
  tokenId: string
  label: string
  /** Tells two removals of the same token apart, so the timer starts again. */
  at: number
}

/** "Goblin 3 vom Feld genommen" with "Rückgängig", for UNDO_REMOVE_MS. */
export function UndoRemoveBar({
  removed,
  bottom,
  connected,
  onUndo,
  onTimeout,
}: {
  removed: JustRemoved
  /** CSS pixels from the board's bottom edge: above the docked token card. */
  bottom: number
  connected: boolean
  onUndo: () => void
  onTimeout: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onTimeout, UNDO_REMOVE_MS)
    return () => clearTimeout(timer)
    // A new removal (another `at`) starts the time again.
  }, [removed.at, onTimeout])

  return (
    <div
      role="status"
      data-testid="undo-remove"
      style={{ bottom: bottom + 12 }}
      className="absolute left-1/2 z-30 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg shadow-black/40"
    >
      <span className="min-w-0 text-sm text-parchment">{t.removed(removed.label)}</span>
      <Button variant="primary" disabled={!connected} onClick={onUndo}>
        {t.undo}
      </Button>
    </div>
  )
}

const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

/** "Vom Feld genommen" in the session DM's top bar, while any token is off the board. */
export function RemovedTokensMenu({
  tokens,
  connected,
  onRestore,
}: {
  /** Newest first, as the board state lists them. */
  tokens: readonly BoardToken[]
  connected: boolean
  onRestore: (token: BoardToken) => void
}) {
  if (tokens.length === 0) return null
  return (
    <Popover
      trigger={t.removedListCount(tokens.length)}
      title={t.removedList}
      side="below"
      triggerClassName="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-parchment hover:border-candle"
    >
      {() => (
        <>
          {!connected && <p className="text-sm text-dim">{t.needsConnection}</p>}
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center gap-2">
                <TokenPicture
                  url={token.imageUrl}
                  label={token.label}
                  ring={ringColor(token)}
                  alt=""
                  className="h-9 w-9 text-sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-parchment">{token.label}</span>
                  {token.removedAt && (
                    <span className="text-xs text-dim">
                      {t.removedAt(timeFormat.format(new Date(token.removedAt)))}
                    </span>
                  )}
                </span>
                <Button
                  aria-label={t.restoreRow(token.label)}
                  disabled={!connected}
                  onClick={() => onRestore(token)}
                >
                  {t.restore}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Popover>
  )
}
