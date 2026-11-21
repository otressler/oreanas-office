// "Zauber" next to "Würfeln" on the fight screen and the session page (knowledge/features/
// spell-cards.md, "At the table"): a gallery of the prepared spells of the characters the
// person plays there. On a phone one card fills the width and the person swipes; wider screens
// show a grid. A tap turns a card over.
import { useEffect, useRef, useState } from 'react'
import type { CharacterSpell } from '../api/types'
import { Button } from '../components/ui'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import { useCampaignSpells } from './queries'
import { CARD_HEIGHT_PX, CARD_WIDTH_PX } from './model'
import { FlipCard } from './SpellCard'

const t = de.spells.gallery

export interface PlayedCharacter {
  id: string
  name: string
}

/** Shown only when one of the characters has prepared spells. */
export function SpellGalleryButton({
  campaignId,
  characters,
  compact = false,
}: {
  campaignId: string
  characters: PlayedCharacter[]
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const spells = useCampaignSpells(campaignId, characters.length > 0)
  const prepared = characters
    .map((character) => ({
      ...character,
      spells: (spells.data?.[character.id] ?? []).filter((s) => s.prepared),
    }))
    .filter((c) => c.spells.length > 0)
  if (prepared.length === 0) return null
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-label={compact ? t.open : undefined}>
        <SpellBookIcon />
        <span className={compact ? 'hidden sm:inline' : undefined}>{t.open}</span>
      </Button>
      {open && <SpellGallery characters={prepared} onClose={() => setOpen(false)} />}
    </>
  )
}

function SpellGallery({
  characters,
  onClose,
}: {
  characters: (PlayedCharacter & { spells: CharacterSpell[] })[]
  onClose: () => void
}) {
  const [tab, setTab] = useState(characters[0].id)
  const current = characters.find((c) => c.id === tab) ?? characters[0]
  return (
    <Modal title={t.title} onClose={onClose} size="page">
      <p className="-mt-3 text-sm text-dim">{t.hint}</p>
      {characters.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-2">
          {characters.map((c) => (
            <Button
              key={c.id}
              role="tab"
              aria-selected={c.id === current.id}
              variant={c.id === current.id ? 'primary' : 'secondary'}
              onClick={() => setTab(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      )}
      <Cards key={current.id} spells={current.spells} />
    </Modal>
  )
}

/** A swiped row on narrow screens, a grid on wide ones. */
function Cards({ spells }: { spells: CharacterSpell[] }) {
  const row = useRef<HTMLUListElement>(null)
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const narrow = width > 0 && width < 640

  useEffect(() => {
    const el = row.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A phone card fills the width, but no more of the height than leaves room for the dialog.
  const height = typeof window === 'undefined' ? 800 : window.innerHeight
  const zoom = narrow
    ? Math.max(0.6, Math.min((width - 24) / CARD_WIDTH_PX, (height - 220) / CARD_HEIGHT_PX))
    : 1.15

  const go = (to: number) => {
    const el = row.current
    if (!el) return
    const next = Math.max(0, Math.min(spells.length - 1, to))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col gap-3">
      <ul
        ref={row}
        aria-label={t.title}
        onScroll={(event) => {
          const el = event.currentTarget
          if (narrow && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth))
        }}
        className={
          narrow
            ? 'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]'
            : 'grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] justify-items-center gap-6'
        }
      >
        {spells.map((entry, i) => (
          <li
            key={entry.spellId}
            className={narrow ? 'flex w-full shrink-0 snap-center justify-center py-2' : 'py-2'}
            aria-hidden={narrow && i !== index ? true : undefined}
          >
            <FlipCard zoom={zoom} spell={entry.variant} />
          </li>
        ))}
      </ul>
      {narrow && spells.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button onClick={() => go(index - 1)} disabled={index === 0} aria-label={t.previous}>
            ←
          </Button>
          <span className="text-sm text-dim tabular-nums" aria-live="polite">
            {t.position(index + 1, spells.length)}
          </span>
          <Button
            onClick={() => go(index + 1)}
            disabled={index >= spells.length - 1}
            aria-label={t.next}
          >
            →
          </Button>
        </div>
      )}
    </div>
  )
}

/** An open book with a star: the spell gallery. */
function SpellBookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5v13" />
      <path d="m7.5 9 .6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2Z" />
    </svg>
  )
}
