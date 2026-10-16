// "Meine Figur" (knowledge/features/player-extras.md): brings the person's own character
// into view, centred and pulsing once, without selecting it. With several characters in
// the fight each tap goes to the next, in the order they were added to the campaign
// (colorIndex). Characters not on the board are skipped; with none, the button is off and
// says why. Not shown to someone without a character in the fight.
//
// Stage 9 contract: the props are final; the board renderer lane builds the button.
import type { RefObject } from 'react'
import type { BoardToken } from '../api/types'
import type { BoardHandle } from '../board/Board'

export interface MyCharacterButtonProps {
  /** Tokens on the board now. */
  tokens: readonly BoardToken[]
  /** Tokens taken off the board, so a removed own character still shows the button, off. */
  removedTokens: readonly BoardToken[]
  userId: string
  board: RefObject<BoardHandle | null>
  className?: string
}

export function MyCharacterButton(props: MyCharacterButtonProps) {
  void props
  return null
}
