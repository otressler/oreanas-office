// "Würfeln" (knowledge/features/dice-tray.md): opens the dice tray in a dialog, on the
// fight screen and the session page, with the person's own tray (tray.ts). The rolls stay
// on the device; nobody else sees them yet.
import { useEffect, useRef, useState } from 'react'
import { useCurrentUser } from '../auth/auth'
import { Button } from '../components/ui'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import { trayFor } from './tray'

const t = de.dice

export function DiceButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-label={compact ? t.open : undefined}>
        <DiceIcon />
        <span className={compact ? 'hidden sm:inline' : undefined}>{t.open}</span>
      </Button>
      {open && <DiceDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function DiceDialog({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser()
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const roller = trayFor(me.id)
    host.current?.appendChild(roller)
    return () => roller.remove()
  }, [me.id])

  return (
    <Modal title={t.title} onClose={onClose} size="narrow">
      <p className="-mt-3 text-sm text-dim">{t.localHint}</p>
      <div ref={host} />
    </Modal>
  )
}

/** A d20 seen from above: a hexagon with its facets. */
function DiceIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M12 7.5 16.5 15h-9Z" />
      <path d="M12 2.5v5M20.5 7.25 16.5 15M3.5 7.25 7.5 15M7.5 15 3.5 16.75M16.5 15l4 1.75M7.5 15 12 21.5l4.5-6.5" />
    </svg>
  )
}
