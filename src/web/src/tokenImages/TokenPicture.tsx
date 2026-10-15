// A token's picture outside the board: the image cropped to a circle inside its ring, or the
// label's first letter while there is none or it doesn't load (knowledge/domain/token.md).
import { useState } from 'react'
import { tokenFill, tokenLetter } from '../board/palette'

export function TokenPicture({
  url,
  label,
  ring,
  alt,
  className = 'h-12 w-12 text-lg',
}: {
  url: string | null | undefined
  /** Its first letter stands in for the image. */
  label: string
  ring: string
  /** The image's alt text; the letter is decorative next to the visible name. */
  alt: string
  /** Size and letter size. */
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const shown = url && failed !== url ? url : null
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] font-semibold text-parchment ${className}`}
      style={{ borderColor: ring, backgroundColor: tokenFill(ring) }}
    >
      {shown ? (
        <img
          src={shown}
          alt={alt}
          decoding="async"
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailed(shown)}
        />
      ) : (
        <span aria-hidden="true">{tokenLetter(label)}</span>
      )}
    </span>
  )
}
