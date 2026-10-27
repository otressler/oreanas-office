import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react'
import { de } from '../text/de'

/** The open dialogs, oldest first: Escape closes only the newest, e.g. a confirm over a page. */
const open: object[] = []

/**
 * A dialog over the page (the editor's full-screen frame is z-40). Escape and the close
 * button close it; focus moves into it when it opens.
 */
export function Modal({
  title,
  onClose,
  size = 'wide',
  children,
}: {
  title: string
  onClose: () => void
  /** "narrow" for a small tool such as the dice tray, "page" for a whole page's content. */
  size?: 'wide' | 'narrow' | 'page'
  children: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  // Callers pass a new onClose on every render; it must not move focus again, or a
  // re-render of the page behind the dialog pulls focus out of the field being typed in.
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
  })

  useEffect(() => {
    panel.current?.focus()
    const self = {}
    open.push(self)
    const onKey = (event: KeyboardEvent) => {
      if (open.at(-1) === self) onEscape(event)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      open.splice(open.indexOf(self), 1)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex w-full ${WIDTH[size]} flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-parchment shadow-xl outline-none`}
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

const WIDTH = { narrow: 'max-w-lg', wide: 'max-w-3xl', page: 'max-w-5xl' }
