import { useEffect, useId, useRef, type ReactNode } from 'react'
import { de } from '../text/de'

/**
 * A dialog over the page (the editor's full-screen frame is z-40). Escape and the close
 * button close it; focus moves into it when it opens.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-parchment shadow-xl outline-none"
      >
        <div className="flex items-start gap-2">
          <h2 id={titleId} className="min-w-0 text-xl font-semibold break-words">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg text-dim hover:text-parchment"
            aria-label={de.sync.close}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
