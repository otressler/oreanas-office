// /kampagnen/:campaignId/bestiarium — the campaign's creature types in this browser, outside
// any map, as cards like the characters' (knowledge/features/creature-page.md). Works offline
// from the campaign's copy, like the map list; icons show only online
// (knowledge/features/token-icons.md), the token's letter stands in without.
import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CREATURE_RING } from '../board/palette'
import { SectionHeading } from '../components/ornaments'
import { AddCard, SheetCard, type Backdrop } from '../components/SheetCard'
import { BackLink } from '../components/sheet'
import { TextField } from '../components/ui'
import { formatModifier } from '../initiative/initiative'
import { useLocalUser } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { de } from '../text/de'
import { useCreatureIcons } from '../tokenImages/queries'
import { BestiaryGate } from './BestiaryGate'
import { setCreatureTypeArchived, useCreatureTypes } from './creatureTypes'
import { creaturePath, newCreaturePath } from './paths'

const t = de.bestiary

/** The lair every card's icon stands in (public/campaign/). */
const BACKDROP: Backdrop = {
  src: '/campaign/creature-backdrop-768.webp',
  srcSet: '/campaign/creature-backdrop-512.webp 512w, /campaign/creature-backdrop-768.webp 768w',
  sizes: '(min-width: 1024px) 220px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw',
}

/** From this many types on, a field filters the cards by name. */
const FILTER_FROM = 12

export function BestiaryPage() {
  const { campaignId = '' } = useParams()
  return (
    <BestiaryGate campaignId={campaignId}>
      {(campaign) => <Bestiary campaignId={campaignId} campaignName={campaign.name} />}
    </BestiaryGate>
  )
}

function Bestiary({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const { db } = useLocalUser()
  const types = useCreatureTypes(db, campaignId)
  const icons = useCreatureIcons(campaignId)
  const [filter, setFilter] = useState('')
  const headingId = useId()
  if (types === undefined) return null

  const active = types.filter((type) => type.archivedAt === null)
  const archived = types.filter((type) => type.archivedAt !== null)
  const query = filter.trim().toLocaleLowerCase('de-DE')
  const shown = query
    ? active.filter((type) => type.name.toLocaleLowerCase('de-DE').includes(query))
    : active

  return (
    <div className="flex flex-col pb-12">
      <BackLink to={`/kampagnen/${campaignId}`} label={campaignName} />
      <div className="mt-6">
        <SectionHeading id={headingId} kicker={campaignName} level={1}>
          {t.title}
        </SectionHeading>
      </div>
      <p className="mt-6 max-w-2xl text-dim">{t.pageIntro}</p>

      {active.length >= FILTER_FROM && (
        <TextField
          label={t.filter}
          type="search"
          autoComplete="off"
          value={filter}
          className="mt-8 max-w-xs"
          onChange={(event) => setFilter(event.target.value)}
        />
      )}
      <div className="mt-10">
        {active.length === 0 && <p className="mb-6 text-dim">{t.empty}</p>}
        {query && shown.length === 0 && <p className="mb-6 text-dim">{t.noMatch}</p>}
        <ul
          aria-labelledby={headingId}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5"
        >
          {shown.map((type) => (
            <li key={type.id} className="flex">
              <CreatureCard campaignId={campaignId} type={type} iconUrl={icons.get(type.id)?.url} />
            </li>
          ))}
          <li className="flex">
            <AddCard to={newCreaturePath(campaignId)} label={t.newType} />
          </li>
        </ul>
      </div>

      {archived.length > 0 && <Archived campaignId={campaignId} types={archived} />}
    </div>
  )
}

/** A type's card: its size and initiative under the name, then the start of its appearance. */
function CreatureCard({
  campaignId,
  type,
  iconUrl,
}: {
  campaignId: string
  type: LocalCreatureType
  iconUrl: string | undefined
}) {
  return (
    <SheetCard
      to={creaturePath(campaignId, type.id)}
      label={t.open(type.name)}
      ring={CREATURE_RING}
      backdrop={BACKDROP}
      portraitUrl={iconUrl}
      portraitAlt={t.icon.alt(type.name)}
      name={type.name}
      meta={
        <>
          {de.sizes[type.size]}
          <span aria-hidden="true"> · </span>
          {t.initiativeShort(formatModifier(type.initiativeModifier ?? 0))}
        </>
      }
      tagline={plain(type.appearance)}
      compact
    />
  )
}

/** The appearance as one plain line for a card: without markdown's marks and line breaks. */
function plain(text: string): string {
  return text
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/(\*\*|\*|__|_)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The archived types, folded: each opens its page or comes back at once. */
function Archived({ campaignId, types }: { campaignId: string; types: LocalCreatureType[] }) {
  const { db } = useLocalUser()
  return (
    <details className="mt-10 rounded-sm border border-candle/15 bg-panel/40 px-4 py-3">
      <summary className="cursor-pointer text-sm text-dim">{t.archived(types.length)}</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {types.map((type) => (
          <li key={type.id} className="flex items-center gap-2 text-sm">
            <Link
              to={creaturePath(campaignId, type.id)}
              className="min-w-0 flex-1 truncate text-dim underline-offset-4 hover:text-parchment hover:underline"
            >
              {type.name}
            </Link>
            <button
              type="button"
              aria-label={t.restoreLabel(type.name)}
              onClick={() => void setCreatureTypeArchived(db, type.id, false)}
              className="min-h-9 rounded-lg px-2 text-candle hover:underline"
            >
              {t.restore}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
