// The tall cards of the campaign's characters (knowledge/features/campaign-page.md) and of
// the bestiary (knowledge/features/creature-page.md): a portrait standing in a lit backdrop,
// the name and a few lines below, the whole card a link to the sheet page.
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { Rule } from './ornaments'

/** A picture in public/ behind every card's portrait, with its sizes for the grid. */
export interface Backdrop {
  src: string
  srcSet: string
  sizes: string
}

/**
 * A tall card, as a whole a link: the portrait as painted, not cut to the token's circle,
 * standing in the backdrop lit in the ring colour, with the ring colour as a bar along the
 * top; below it the name, `meta` and the `tagline` (three lines at most, two when `compact`).
 */
export function SheetCard({
  to,
  label,
  ring,
  backdrop,
  portraitUrl,
  portraitAlt,
  name,
  meta,
  tagline,
  compact = false,
}: {
  to: string
  /** The link's accessible name. */
  label: string
  ring: string
  backdrop: Backdrop
  portraitUrl: string | null | undefined
  portraitAlt: string
  name: string
  meta: ReactNode
  tagline?: string
  /** For the denser grid of a bestiary. */
  compact?: boolean
}) {
  return (
    <Link to={to} aria-label={label} className="flex w-full">
      <article
        style={{ '--ring': ring } as CSSProperties}
        className="group relative flex w-full flex-col overflow-hidden rounded-sm border border-candle/25 bg-panel shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] transition-colors hover:border-candle/60"
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          <img
            src={backdrop.src}
            srcSet={backdrop.srcSet}
            sizes={backdrop.sizes}
            alt=""
            decoding="async"
            className="absolute inset-0 size-full object-cover object-[50%_35%] opacity-75"
          />
          {/* The backdrop's light in the ring colour. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_45%,color-mix(in_srgb,var(--ring)_40%,transparent),transparent_75%)]"
          />
          <Figure url={portraitUrl} alt={portraitAlt} name={name} ring={ring} compact={compact} />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-panel via-panel/70 to-transparent"
          />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--ring)]" />
        </div>
        <div
          className={`relative z-[1] flex flex-1 flex-col gap-2 ${compact ? '-mt-9 px-3 pb-3' : '-mt-12 px-4 pb-4'}`}
        >
          <h3
            className={`font-display leading-tight font-semibold break-words text-parchment text-shadow-[0_2px_8px_rgb(0_0_0/0.9)] ${compact ? 'text-lg' : 'text-xl'}`}
          >
            {name}
          </h3>
          <div
            aria-hidden="true"
            className="h-px w-24 bg-gradient-to-r from-[var(--ring)] to-transparent"
          />
          <p className="text-sm text-dim">{meta}</p>
          {tagline && (
            <p
              className={`text-sm text-parchment/75 italic ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}
            >
              {tagline}
            </p>
          )}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1.5 rounded-sm border border-candle/10"
        />
      </article>
    </Link>
  )
}

/**
 * The picked portrait, uncropped and fading at its edges into the backdrop; without one, or
 * while it doesn't load, the token's letter in its ring.
 */
function Figure({
  url: given,
  alt,
  name,
  ring,
  compact,
}: {
  url: string | null | undefined
  alt: string
  name: string
  ring: string
  compact: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const url = given && failed !== given ? given : null
  if (!url) {
    return (
      <div className="absolute inset-x-0 top-[38%] flex -translate-y-1/2 justify-center">
        <TokenPicture
          url={null}
          label={name}
          ring={ring}
          alt=""
          className={`shadow-[0_0_40px_color-mix(in_srgb,var(--ring)_45%,transparent)] ${compact ? 'size-20 text-3xl' : 'size-24 text-4xl sm:size-28 sm:text-5xl'}`}
        />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={alt}
      decoding="async"
      onError={() => setFailed(url)}
      className="absolute bottom-[6%] left-1/2 aspect-square w-[92%] -translate-x-1/2 object-contain drop-shadow-[0_12px_24px_rgb(0_0_0/0.85)] transition-transform duration-700 [mask-image:radial-gradient(closest-side,black_78%,transparent)] group-hover:scale-[1.04] motion-reduce:transition-none"
    />
  )
}

/** The last tile of a grid: something new, in the shape of a card. */
export function AddCard({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="group flex min-h-48 w-full flex-col items-center justify-center gap-4 rounded-sm border border-dashed border-candle/35 bg-panel/40 p-4 text-center transition-colors hover:border-candle/70 hover:bg-panel/70"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full border border-candle/50 font-display text-3xl text-candle transition-colors group-hover:border-candle group-hover:text-candle-strong"
      >
        +
      </span>
      <span className="font-display text-sm font-semibold tracking-[0.15em] text-parchment uppercase">
        {label}
      </span>
      <Rule centred className="w-24" />
    </Link>
  )
}
