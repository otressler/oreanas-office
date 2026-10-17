import type { HubConnection } from '@microsoft/signalr'
import type { BoardState } from '../api/types'

export interface SharedScreenControlsProps {
  encounterId: string
  /** The board as the players' view of the fight (?view=player), kept current by the screen. */
  board: BoardState
  /** The screen's table connection, already joined to the encounter as a shared screen. */
  connection: HubConnection | null
}

// The controls of a shared screen in local mode (knowledge/features/shared-table.md): selection,
// token card, moves of every character, pings, statuses and its own undo, as a layer over the
// spectator screen's board. STUB: the shared table lane builds it; the spectator lane renders
// it only when the device was opened as a shared screen.
export function SharedScreenControls(_props: SharedScreenControlsProps) {
  return null
}
