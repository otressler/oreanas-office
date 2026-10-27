import { useId, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { Campaign, Character } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { ringColor } from '../board/palette'
import { Rule, SectionHeading } from '../components/ornaments'
import { LoadError, Loading } from '../components/ui'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { characterPath, newCharacterPath } from './paths'
import { useCharacters } from './queries'

const t = de.characters

/** The alcove every card's portrait stands in (public/campaign/). */
const BACKDROP = {
  src: '/campaign/character-backdrop-1024.webp',
  srcSet:
    '/campaign/character-backdrop-512.webp 512w, /campaign/character-backdrop-1024.webp 1024w',
  sizes: '(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw',
}

/**
 * The campaign's characters as tall cards, the viewer's own first
 * (knowledge/features/campaign-page.md). A card is a link to the character's page, where
 * its player (or a `dm` member) edits it (knowledge/features/character-page.md); only a new
 * character's form opens here, below the cards, where `dm` members also pick whom it
 * belongs to.
 */
export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const campaignId = campaign.id
  const me = useCurrentUser()
  const characters = useCharacters(campaignId)
  const headingId = useId()
  const ordered = characters.data ? mineFirst(characters.data, me.id) : []

  return (
    <section aria-labelledby={headingId} className="mt-16">
      <SectionHeading id={headingId} kicker={t.kicker} level={2}>
        {t.title}
      </SectionHeading>
      <div className="mt-10">
        {characters.isPending ? (
          <Loading />
        ) : characters.isError ? (
          <LoadError error={characters.error} onRetry={() => void characters.refetch()} />
        ) : (
          <>
            {characters.data.length === 0 && <p className="mb-6 text-dim">{t.empty}</p>}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {ordered.map((character) => (
                <li key={character.id} className="flex">
                  <CharacterCard
                    campaignId={campaignId}
                    character={character}
                    mine={character.ownerUserId === me.id}
                  />
                </li>
              ))}
              <li className="flex">
                <AddCard to={newCharacterPath(campaignId)} />
              </li>
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

/** The viewer's characters first, the rest in the server's order. */
function mineFirst(characters: Character[], userId: string): Character[] {
  return [
    ...characters.filter((character) => character.ownerUserId === userId),
    ...characters.filter((character) => character.ownerUserId !== userId),
  ]
}

/**
 * A tall card, as a whole a link to the character's page: the portrait as painted, not cut
 * to the token's circle, standing in a lit alcove in the character's ring colour; below it
 * the name, who plays it, its size and its flavor sentence.
 */
function CharacterCard({
  campaignId,
  character,
  mine,
}: {
  campaignId: string
  character: Character
  mine: boolean
}) {
  const ring = ringColor({ kind: 'character', ...character })
  return (
    <Link
      to={characterPath(campaignId, character.id)}
      aria-label={t.page.open(character.name)}
      className="flex w-full"
    >
      <article
        style={{ '--ring': ring } as CSSProperties}
        className="group relative flex w-full flex-col overflow-hidden rounded-sm border border-candle/25 bg-panel shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] transition-colors hover:border-candle/60"
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          <img
            src={BACKDROP.src}
            srcSet={BACKDROP.srcSet}
            sizes={BACKDROP.sizes}
            alt=""
            decoding="async"
            className="absolute inset-0 size-full object-cover object-[50%_35%] opacity-75"
          />
          {/* The alcove's light in the character's colour. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_45%,color-mix(in_srgb,var(--ring)_40%,transparent),transparent_75%)]"
          />
          <Figure character={character} ring={ring} />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-panel via-panel/70 to-transparent"
          />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--ring)]" />
        </div>
        <div className="relative z-[1] -mt-12 flex flex-1 flex-col gap-2 px-4 pb-4">
          <h3 className="font-display text-xl leading-tight font-semibold break-words text-parchment text-shadow-[0_2px_8px_rgb(0_0_0/0.9)]">
            {character.name}
          </h3>
          <div
            aria-hidden="true"
            className="h-px w-24 bg-gradient-to-r from-[var(--ring)] to-transparent"
          />
          <p className="text-sm text-dim">
            {mine ? (
              <span className="font-semibold text-candle">{t.mine}</span>
            ) : (
              t.owner(character.ownerDisplayName)
            )}
            <span aria-hidden="true"> · </span>
            {de.sizes[character.size]}
          </p>
          {character.tagline && (
            <p className="line-clamp-3 text-sm text-parchment/75 italic">{character.tagline}</p>
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
 * The picked portrait, uncropped and fading at its edges into the alcove; without one, or
 * while it doesn't load, the token's letter in its ring.
 */
function Figure({ character, ring }: { character: Character; ring: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const url =
    character.portraitUrl && failed !== character.portraitUrl ? character.portraitUrl : null
  if (!url) {
    return (
      <div className="absolute inset-x-0 top-[38%] flex -translate-y-1/2 justify-center">
        <TokenPicture
          url={null}
          label={character.name}
          ring={ring}
          alt=""
          className="size-24 text-4xl shadow-[0_0_40px_color-mix(in_srgb,var(--ring)_45%,transparent)] sm:size-28 sm:text-5xl"
        />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={t.portraitAlt(character.name)}
      decoding="async"
      onError={() => setFailed(url)}
      className="absolute bottom-[6%] left-1/2 aspect-square w-[92%] -translate-x-1/2 object-contain drop-shadow-[0_12px_24px_rgb(0_0_0/0.85)] transition-transform duration-700 [mask-image:radial-gradient(closest-side,black_78%,transparent)] group-hover:scale-[1.04] motion-reduce:transition-none"
    />
  )
}

/** The last tile of the grid: a new character, in the shape of a card; it opens the page as editor. */
function AddCard({ to }: { to: string }) {
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
        {t.add}
      </span>
      <Rule centred className="w-24" />
    </Link>
  )
}
