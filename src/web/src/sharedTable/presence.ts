// "Who is here" (knowledge/features/shared-table.md): what each round avatar of the row shows.
// Pure functions; PresenceRow draws them.
import type { BoardPerson, BoardToken, PresenceState } from '../api/types'
import { ringColor } from '../board/palette'

/** The session DM's ring (the server's TablePeople.SessionDmColor). */
export const SESSION_DM_RING = '#f5b81c'

/** A person without a character in the fight gets this ring around their white initial. */
export const NO_CHARACTER_RING = '#6b6558'

export interface Avatar {
  /** A person's user id, or 'table' for the shared screen. */
  key: string
  name: string | null
  connected: boolean
  kind: 'person' | 'table'
  ring: string
  /** The portrait of the person's character, if it has a picture. */
  imageUrl: string | null
  /** Shown when there is no portrait: the first letter of the character's or the person's name. */
  initial: string
}

/** The character the avatar shows: the one added to the campaign first (lowest colorIndex). */
export function firstCharacter(
  tokens: readonly BoardToken[],
  userId: string,
): BoardToken | undefined {
  let first: BoardToken | undefined
  for (const token of tokens) {
    if (token.kind !== 'character' || token.ownerUserId !== userId) continue
    if (!first || (token.colorIndex ?? 0) < (first.colorIndex ?? 0)) first = token
  }
  return first
}

function initialOf(name: string | null | undefined): string {
  const letter = [...(name ?? '').trim()][0]
  return letter ? letter.toLocaleUpperCase('de-DE') : '?'
}

/**
 * The avatars in the server's order, then the table icon while a shared screen is connected.
 * The session DM's ring is gold, also with a character of their own in the fight.
 */
export function buildAvatars(
  presence: PresenceState,
  people: readonly BoardPerson[],
  tokens: readonly BoardToken[],
): Avatar[] {
  const avatars = presence.people.map((person): Avatar => {
    const name = people.find((p) => p.userId === person.userId)?.displayName ?? null
    const character = firstCharacter(tokens, person.userId)
    const ring = person.isSessionDm
      ? SESSION_DM_RING
      : character
        ? ringColor(character)
        : NO_CHARACTER_RING
    return {
      key: person.userId,
      name,
      connected: person.connected,
      kind: 'person',
      ring,
      imageUrl: character?.imageUrl ?? null,
      // Someone without a character shows their own initial; a character without a picture, its letter.
      initial: initialOf(character?.label ?? name),
    }
  })
  if (presence.sharedScreen) {
    avatars.push({
      key: 'table',
      name: null,
      connected: true,
      kind: 'table',
      ring: NO_CHARACTER_RING,
      imageUrl: null,
      initial: '',
    })
  }
  return avatars
}
