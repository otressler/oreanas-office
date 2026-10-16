// A status's icon outside the board (knowledge/features/statuses.md, "Icons"): its picture
// on a small dark disc, or its first letter while it has none or the picture doesn't load
// (the library's static icons may be missing on a development machine). With a level,
// the number sits on the disc's edge.
import { useState } from 'react'
import type { StatusDefinition } from '../api/types'
import { statusLetter } from './names'

export function StatusIcon({
  status,
  level,
  className = 'h-8 w-8 text-sm',
}: {
  status: Pick<StatusDefinition, 'libraryKey' | 'name' | 'iconUrl'> | undefined
  level?: number | null
  /** Size and letter size. */
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = status?.iconUrl
  const shown = url && failed !== url ? url : null
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 ${className}`}>
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-line bg-black/70 font-semibold text-parchment">
        {shown ? (
          <img
            src={shown}
            alt=""
            decoding="async"
            className="h-full w-full object-contain p-0.5"
            onError={() => setFailed(shown)}
          />
        ) : (
          (status && statusLetter(status)) || '?'
        )}
      </span>
      {level != null && (
        <span className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-candle px-0.5 text-[0.65rem] leading-none font-bold text-table">
          {level}
        </span>
      )}
    </span>
  )
}
