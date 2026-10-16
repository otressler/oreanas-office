// Who may do what with statuses at the table (knowledge/features/statuses.md, "Who puts
// statuses on which token"): the session DM puts them on any token and removes any;
// everyone else puts them on their own characters and on creatures, and removes (or
// changes the level of) the ones they put on. The server checks the same rules; the app
// only hides what isn't allowed.
import type {
  BoardPerson,
  BoardState,
  BoardToken,
  BoardTokenStatus,
  StatusDefinition,
} from '../api/types'

/** Levels go from 1 to 6 (Exhaustion, and custom statuses with levels). */
export const MIN_LEVEL = 1
export const MAX_LEVEL = 6

/** Whether the person may put statuses on the token: not on other players' characters. */
export function canAddStatus(
  token: Pick<BoardToken, 'kind' | 'ownerUserId'>,
  board: Pick<BoardState, 'isSessionDm'>,
  userId: string,
): boolean {
  if (board.isSessionDm) return true
  return token.kind === 'creature' || token.ownerUserId === userId
}

/** Whether the person may take the status off (or change its level). */
export function canRemoveStatus(
  status: Pick<BoardTokenStatus, 'appliedByUserId'>,
  board: Pick<BoardState, 'isSessionDm'>,
  userId: string,
): boolean {
  return board.isSessionDm || status.appliedByUserId === userId
}

/** The definition of a status on the board, by id. */
export function findDefinition(
  definitions: readonly StatusDefinition[],
  statusId: string,
): StatusDefinition | undefined {
  return definitions.find((definition) => definition.id === statusId)
}

/** A person's display name on the board; null for someone no longer in the campaign. */
export function personName(people: readonly BoardPerson[], userId: string | null): string | null {
  if (!userId) return null
  return people.find((person) => person.userId === userId)?.displayName ?? null
}

/** A level kept between MIN_LEVEL and MAX_LEVEL. */
export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level))
}
