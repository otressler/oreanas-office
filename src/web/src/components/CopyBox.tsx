import { useEffect, useRef, useState } from 'react'
import { de } from '../text/de'
import { inputClass } from './styles'
import { Button } from './ui'

/**
 * A link or code to pass on: shown read-only, with "Kopieren" and, where the
 * device has a share sheet (phones), "Teilen".
 */
export function CopyBox({
  value,
  label,
  shareTitle,
  large = false,
}: {
  value: string
  label: string
  shareTitle?: string
  /** Big monospace text, for a short code read out at the table. */
  large?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2_000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // No clipboard access (e.g. plain http): select the text for a manual copy.
      inputRef.current?.select()
    }
  }

  async function share() {
    const isUrl = /^https?:\/\//.test(value)
    try {
      await navigator.share(
        isUrl ? { title: shareTitle, url: value } : { title: shareTitle, text: value },
      )
    } catch {
      // Cancelled by the user, or the share sheet failed; nothing to do.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        readOnly
        value={value}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className={`${inputClass} ${large ? 'font-mono text-2xl tracking-[0.3em] text-candle' : 'font-mono text-sm'}`}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>
          <span aria-live="polite">{copied ? de.common.copied : de.common.copy}</span>
        </Button>
        {canShare && <Button onClick={() => void share()}>{de.common.share}</Button>}
      </div>
    </div>
  )
}
