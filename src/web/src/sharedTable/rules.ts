// What a shared screen may do in local mode (knowledge/features/shared-table.md). It acts
// like a player who owns every character: it moves every character and no creature. The
// server checks the same rules (TablePermissions); the app only hides what isn't allowed.
import type { BoardToken, PlayMode } from '../api/types'

/** Every character, whoever owns it; never a creature. */
export function canMoveAsTable(token: Pick<BoardToken, 'kind'>): boolean {
  return token.kind === 'character'
}

/** Every character is drawn, and tapped, above the creatures, so none gets buried. */
export function charactersOnTop<T extends Pick<BoardToken, 'kind'>>(tokens: readonly T[]): T[] {
  return [
    ...tokens.filter((token) => token.kind !== 'character'),
    ...tokens.filter((token) => token.kind === 'character'),
  ]
}

/** Whether the shared screen has its controls: only in local mode; otherwise it only watches. */
export function hasControls(playMode: PlayMode): boolean {
  return playMode === 'local'
}
