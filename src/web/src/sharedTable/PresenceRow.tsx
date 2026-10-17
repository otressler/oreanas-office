import type { BoardPerson, BoardToken, PresenceState } from '../api/types'

export interface PresenceRowProps {
  presence: PresenceState
  people: BoardPerson[]
  /** The fight's tokens, for the portraits and ring colours of the people's characters. */
  tokens: BoardToken[]
  sessionDmUserId: string | null
}

// "Who is here": the row of avatars along the top of the board
// (knowledge/features/shared-table.md). STUB: the shared table lane builds it; every board
// screen (players, DM, spectator, shared screen) renders it above the board.
export function PresenceRow(_props: PresenceRowProps) {
  return null
}
