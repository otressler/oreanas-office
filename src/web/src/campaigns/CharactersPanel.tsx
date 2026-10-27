import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Campaign, Character } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { ringColor } from '../board/palette'
import { PencilIcon } from '../components/icons'
import { Rule, SectionHeading } from '../components/ornaments'
import { LoadError, Loading } from '../components/ui'
import { StatusListEditor } from '../statuses/StatusListEditor'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { CharacterForm, type OwnerChoice } from './CharacterForm'
import { useCharacters } from './queries'

const t = de.characters

/** The alcove every card's portrait stands in (public/campaign/). */
const BACKDROP = {
  src: '/campaign/character-backdrop-1024.webp',
  srcSet:
    '/campaign/character-backdrop-512.webp 512w, /campaign/character-backdrop-1024.webp 1024w',
  sizes: '(min-width: 1024px) 270px, (min-width: 640px) 33vw, 50vw',
}

/** What is open below or beside the cards: one at a time. */
type Open = { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'statuses'; id: string } | null

/**
 * The campaign's characters as tall cards, the viewer's own first
 * (knowledge/features/campaign-page.md). Players edit their own, `dm` members any
 * (`canEdit`) and also pick whom each belongs to. An opened card spans the row, with its
 * form or status list beside it.
 */
export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const campaignId = campaign.id
  const me = useCurrentUser()
  const owners: OwnerChoice | undefined =
    campaign.myRole === 'dm' ? { members: campaign.members, me: me.id } : undefined
  const characters = useCharacters(campaignId)
  const [open, setOpen] = useState<Open>(null)
  const headingId = useId()
  const ordered = characters.data ? mineFirst(characters.data, me.id) : []
  const opened = open && 'id' in open ? ordered.find((c) => c.id === open.id) : undefined

  /** Opens `next`, or closes it when it is already open. */
  function toggle(next: Exclude<Open, null>) {
    setOpen((current) =>
      current?.kind === next.kind &&
      (!('id' in current) || ('id' in next && current.id === next.id))
        ? null
        : next,
    )
  }

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
            {characters.data.length === 0 && open?.kind !== 'new' && (
              <p className="mb-6 text-dim">{t.empty}</p>
            )}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
              {ordered.map((character) => (
                <li key={character.id} className="flex">
                  <CharacterCard
                    character={character}
                    mine={character.ownerUserId === me.id}
                    open={open && 'id' in open && open.id === character.id ? open.kind : null}
                    onEdit={() => toggle({ kind: 'edit', id: character.id })}
                    onStatuses={() => toggle({ kind: 'statuses', id: character.id })}
                  />
                </li>
              ))}
              <li className="flex">
                <AddCard open={open?.kind === 'new'} onClick={() => toggle({ kind: 'new' })} />
              </li>
            </ul>
            {open?.kind === 'new' && (
              <Opened key="new">
                <CharacterForm
                  campaignId={campaignId}
                  owners={owners}
                  className={OPENED_PANEL}
                  onDone={() => setOpen(null)}
                />
              </Opened>
            )}
            {opened && open?.kind === 'edit' && (
              <Opened key={`edit-${opened.id}`}>
                <CharacterForm
                  campaignId={campaignId}
                  character={opened}
                  owners={owners}
                  className={OPENED_PANEL}
                  onDone={() => setOpen(null)}
                />
              </Opened>
            )}
            {opened && open?.kind === 'statuses' && (
              <Opened key={`statuses-${opened.id}`}>
                <section
                  id={statusListId(opened)}
                  aria-label={de.statuses.list.show(opened.name)}
                  className={OPENED_PANEL}
                >
                  <h3 className="font-display text-xl font-semibold text-parchment">
                    {de.statuses.list.title}: {opened.name}
                  </h3>
                  <p className="text-sm text-dim">{de.statuses.list.help}</p>
                  <StatusListEditor
                    campaignId={campaignId}
                    owner={{ kind: 'character', characterId: opened.id }}
                  />
                </section>
              </Opened>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** The look of the form or list below the cards. */
const OPENED_PANEL =
  'flex flex-col gap-3 rounded-sm border border-candle/25 bg-panel p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]'

function statusListId(character: Character): string {
  return `statuses-${character.id}`
}

/** The viewer's characters first, the rest in the server's order. */
function mineFirst(characters: Character[], userId: string): Character[] {
  return [
    ...characters.filter((character) => character.ownerUserId === userId),
    ...characters.filter((character) => character.ownerUserId !== userId),
  ]
}

/**
 * What a card opened, below the cards so the grid stays as it is. Scrolls into view, since
 * the card that opened it can be far above.
 */
function Opened({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [])
  return (
    <div ref={ref} className="mt-8 max-w-3xl scroll-mt-4">
      {children}
    </div>
  )
}

/**
 * A tall card: the portrait as painted, not cut to the token's circle, standing in a lit
 * alcove in the character's ring colour; below it the name, who plays it, its size and
 * appearance, and the way to its status list.
 */
function CharacterCard({
  character,
  mine,
  open,
  onEdit,
  onStatuses,
}: {
  character: Character
  mine: boolean
  open: 'edit' | 'statuses' | null
  onEdit: () => void
  onStatuses: () => void
}) {
  const ring = ringColor({ kind: 'character', ...character })
  return (
    <article
      style={{ '--ring': ring } as CSSProperties}
      className={`group relative flex w-full flex-col overflow-hidden rounded-sm border bg-panel shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] transition-colors ${
        open ? 'border-candle/70' : 'border-candle/25 hover:border-candle/60'
      }`}
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
        {character.canEdit && (
          <button
            type="button"
            aria-label={t.editTitle(character.name)}
            title={t.editTitle(character.name)}
            aria-expanded={open === 'edit'}
            onClick={onEdit}
            className={`absolute top-2 right-2 z-10 flex size-11 items-center justify-center rounded-full border bg-table/75 backdrop-blur-sm transition-colors ${
              open === 'edit'
                ? 'border-candle text-candle-strong'
                : 'border-candle/40 text-parchment hover:border-candle hover:text-candle-strong'
            }`}
          >
            <PencilIcon className="size-5" />
          </button>
        )}
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
        {character.appearance && (
          <p className="line-clamp-3 text-sm text-parchment/75 italic">{character.appearance}</p>
        )}
        <div className="mt-auto pt-2">
          <button
            type="button"
            aria-expanded={open === 'statuses'}
            aria-controls={open === 'statuses' ? statusListId(character) : undefined}
            aria-label={de.statuses.list.show(character.name)}
            onClick={onStatuses}
            className={`-mx-2 min-h-9 rounded-sm px-2 font-display text-xs font-semibold tracking-[0.15em] uppercase transition-colors ${
              open === 'statuses' ? 'text-candle-strong' : 'text-candle hover:text-candle-strong'
            }`}
          >
            {de.statuses.list.title}
          </button>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-sm border border-candle/10"
      />
    </article>
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

/** The last tile of the grid: a new character, in the shape of a card. */
function AddCard({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className={`group flex min-h-48 w-full flex-col items-center justify-center gap-4 rounded-sm border border-dashed p-4 text-center transition-colors hover:bg-panel/70 ${
        open ? 'border-candle bg-panel/70' : 'border-candle/35 bg-panel/40 hover:border-candle/70'
      }`}
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
    </button>
  )
}
