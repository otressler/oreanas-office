// "Rückgängig" for a few seconds after the session DM changed what players see: a fog
// change, a creature revealed or hidden, a spawn (knowledge/features/fog-of-war.md, "Undo";
// creature-spawn.md). Like the bar after removing a token, but it asks the server to take
// back the latest change (UndoChange).
import { useEffect } from 'react'
import { Button } from '../components/ui'

/** How long the bar stays. */
export const UNDO_CHANGE_MS = 8_000

/** The change just made: its text for the bar, and when, so a new change starts the time again. */
export interface JustChanged {
  text: string
  at: number
}

export function UndoChangeBar({
  changed,
  label,
  bottom,
  connected,
  onUndo,
  onTimeout,
}: {
  changed: JustChanged
  /** The button's text. */
  label: string
  /** CSS pixels from the board's bottom edge: above the docked card and the other bars. */
  bottom: number
  connected: boolean
  onUndo: () => void
  onTimeout: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onTimeout, UNDO_CHANGE_MS)
    return () => clearTimeout(timer)
  }, [changed.at, onTimeout])

  return (
    <div
      role="status"
      data-testid="undo-change"
      style={{ bottom: bottom + 12 }}
      className="absolute left-1/2 z-30 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-lg shadow-black/40"
    >
      <span className="min-w-0 text-sm text-parchment">{changed.text}</span>
      <Button variant="primary" disabled={!connected} onClick={onUndo}>
        {label}
      </Button>
    </div>
  )
}
