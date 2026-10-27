import { useId } from 'react'
import type { Campaign, Character } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { ringColor } from '../board/palette'
import { SectionHeading } from '../components/ornaments'
import { AddCard, SheetCard, type Backdrop } from '../components/SheetCard'
import { LoadError, Loading } from '../components/ui'
import { de } from '../text/de'
import { characterPath, newCharacterPath } from './paths'
import { useCharacters } from './queries'

const t = de.characters

/** The alcove every card's portrait stands in (public/campaign/). */
const BACKDROP: Backdrop = {
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
                <AddCard to={newCharacterPath(campaignId)} label={t.add} />
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

/** A character's card: who plays it and its size under the name, then its flavor sentence. */
function CharacterCard({
  campaignId,
  character,
  mine,
}: {
  campaignId: string
  character: Character
  mine: boolean
}) {
  return (
    <SheetCard
      to={characterPath(campaignId, character.id)}
      label={t.page.open(character.name)}
      ring={ringColor({ kind: 'character', ...character })}
      backdrop={BACKDROP}
      portraitUrl={character.portraitUrl}
      portraitAlt={t.portraitAlt(character.name)}
      name={character.name}
      meta={
        <>
          {mine ? (
            <span className="font-semibold text-candle">{t.mine}</span>
          ) : (
            t.owner(character.ownerDisplayName)
          )}
          <span aria-hidden="true"> · </span>
          {de.sizes[character.size]}
        </>
      }
      tagline={character.tagline}
    />
  )
}
