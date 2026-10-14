import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * A button that opens a small panel next to it, e.g. the editor's encounter list in the
 * header or the layout problems in the status bar. A click outside and Escape close it.
 */
export function Popover({
  trigger,
  label,
  title,
  side,
  triggerClassName,
  children,
}: {
  /** The button's content. */
  trigger: ReactNode
  /** The button's accessible name, when its content isn't enough. */
  label?: string
  /** The panel's heading, and its accessible name. */
  title: string
  /** Below the button (the header) or above it (the status bar). */
  side: 'below' | 'above'
  triggerClassName: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // The editor's own Escape (deselect, cancel) listens on window, after this.
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className={`absolute right-0 z-50 flex max-h-[70vh] w-80 flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-panel p-4 text-parchment shadow-lg shadow-black/40 ${
            side === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          <h2 id={titleId} className="text-xs font-semibold tracking-wide text-dim uppercase">
            {title}
          </h2>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
