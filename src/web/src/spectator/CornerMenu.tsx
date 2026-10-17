import { useEffect, useRef, useState } from 'react'
import { de } from '../text/de'

const t = de.spectator

/** Whether the browser can show the page full screen (iPhones can't). */
function canFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true
}

function useFullscreen() {
  const [active, setActive] = useState(() => document.fullscreenElement !== null)
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = () => {
    const request = active
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
    request.catch(() => {})
  }
  return { active, toggle }
}

/**
 * The small menu in the corner of the spectator screen (knowledge/features/spectator-view.md):
 * "Ganze Karte" (while a fight shows), full screen on and off, "Zuschaueransicht verlassen".
 */
export function CornerMenu({
  onFit,
  onLeave,
}: {
  onFit: (() => void) | null
  onLeave: () => void
}) {
  const [open, setOpen] = useState(false)
  const fullscreen = useFullscreen()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const item =
    'flex min-h-14 w-full items-center px-5 text-left text-lg text-parchment hover:bg-line/40'
  return (
    <div ref={root} className="absolute top-3 right-3 z-30 flex flex-col items-end gap-2">
      <button
        type="button"
        aria-label={t.menuLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex size-12 items-center justify-center rounded-full border border-line bg-panel/80 text-xl text-parchment shadow-lg shadow-black/40"
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div
          role="menu"
          className="min-w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-lg shadow-black/50"
        >
          {onFit && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                onFit()
                setOpen(false)
              }}
            >
              {t.fit}
            </button>
          )}
          {canFullscreen() && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                fullscreen.toggle()
                setOpen(false)
              }}
            >
              {fullscreen.active ? t.exitFullscreen : t.fullscreen}
            </button>
          )}
          <button type="button" role="menuitem" className={item} onClick={onLeave}>
            {t.leave}
          </button>
        </div>
      )}
    </div>
  )
}
