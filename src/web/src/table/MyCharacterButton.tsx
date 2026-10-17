// "Meine Figur" (knowledge/features/player-extras.md): brings the person's own character
// into view, centred and pulsing once, without selecting it. With several characters in
// the fight each tap goes to the next, in the order they were added to the campaign
// (colorIndex). Characters not on the board are skipped; with none, the button is off and
// says why. Not shown to someone without a character in the fight. It only moves the view,
// so it works without a connection too.
import { useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { BoardToken } from '../api/types'
import type { BoardHandle } from '../board/Board'
import { de } from '../text/de'

export interface MyCharacterButtonProps {
  /** Tokens on the board now. */
  tokens: readonly BoardToken[]
  /** Tokens taken off the board, so a removed own character still shows the button, off. */
  removedTokens: readonly BoardToken[]
  userId: string
  board: RefObject<BoardHandle | null>
  className?: string
  /** E.g. a `bottom` that keeps it above the page's docked card. */
  style?: CSSProperties
}

const t = de.playerExtras

/** The person's characters among `tokens`, in campaign order (colorIndex, then label). */
function ownCharacters(tokens: readonly BoardToken[], userId: string): BoardToken[] {
  return tokens
    .filter((token) => token.kind === 'character' && token.ownerUserId === userId)
    .sort(
      (a, b) =>
        (a.colorIndex ?? Number.MAX_SAFE_INTEGER) - (b.colorIndex ?? Number.MAX_SAFE_INTEGER) ||
        a.label.localeCompare(b.label, 'de-DE'),
    )
}

/** The character after `lastId` in `own`, starting again at the first. */
function nextCharacter(own: readonly BoardToken[], lastId: string | null): BoardToken | null {
  if (own.length === 0) return null
  const index = own.findIndex((token) => token.id === lastId)
  return own[(index + 1) % own.length]!
}

export function MyCharacterButton({
  tokens,
  removedTokens,
  userId,
  board,
  className = 'absolute right-3 bottom-16 z-20',
  style,
}: MyCharacterButtonProps) {
  const own = ownCharacters(tokens, userId)
  // Players don't get the removed tokens: one seen on the board here keeps the button, off.
  const [seen, setSeen] = useState(false)
  if (own.length > 0 && !seen) setSeen(true)
  const last = useRef<string | null>(null)

  const removed = removedTokens.some(
    (token) => token.kind === 'character' && token.ownerUserId === userId,
  )
  if (own.length === 0 && !removed && !seen) return null

  const off = own.length === 0
  return (
    <button
      type="button"
      disabled={off}
      style={style}
      onClick={() => {
        const next = nextCharacter(own, last.current)
        if (!next) return
        last.current = next.id
        board.current?.centerOn(next.id, { pulse: true })
      }}
      className={`${className} inline-flex min-h-11 max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-line bg-panel/90 px-3 text-sm text-parchment shadow-lg shadow-black/40 hover:border-candle disabled:text-dim disabled:hover:border-line`}
    >
      <PersonIcon />
      {off ? t.notOnBoard : t.myCharacter}
    </button>
  )
}

/** A head and shoulders in a target ring. */
function PersonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5a6 6 0 0 1 11 0" />
    </svg>
  )
}
