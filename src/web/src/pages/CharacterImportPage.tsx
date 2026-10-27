// /kampagnen/:campaignId/charaktere/uebernehmen — the viewer's characters in their other
// campaigns, as cards by campaign, each with a button to copy it into this one
// (knowledge/features/character-import.md). Characters can't be deleted, so a click on a
// card itself does nothing; only its button imports.
import { useId, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { ImportableCharacter } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { ringColor } from '../board/palette'
import { CHARACTER_BACKDROP } from '../campaigns/backdrop'
import { characterPath } from '../campaigns/paths'
import { useCampaign, useCharacters, useImportableCharacters } from '../campaigns/queries'
import { useImportCharacter } from '../campaigns/useImportCharacter'
import { SectionHeading } from '../components/ornaments'
import { BackLink, SectionTitle } from '../components/sheet'
import { SheetCard } from '../components/SheetCard'
import { Button, ErrorAlert, LoadError, Loading } from '../components/ui'
import { de } from '../text/de'

const t = de.characters
const i = t.import

export function CharacterImportPage() {
  const { campaignId = '' } = useParams()
  const me = useCurrentUser()
  const campaign = useCampaign(campaignId)
  const characters = useCharacters(campaignId)
  const importable = useImportableCharacters(campaignId)
  const importing = useImportCharacter(campaignId)
  const navigate = useNavigate()

  for (const query of [campaign, characters, importable]) {
    if (query.isPending) return <Loading />
    if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />
  }
  if (!campaign.data || !characters.data || !importable.data) return null

  // A copy without a colour of its own takes the next default one here.
  const nextColorIndex = characters.data.length
  const namesHere = new Set(
    characters.data
      .filter((character) => character.ownerUserId === me.id)
      .map((character) => character.name.toLocaleLowerCase('de-DE')),
  )

  function take(character: ImportableCharacter) {
    importing.mutate(character.id, {
      onSuccess: (copy) => void navigate(characterPath(campaignId, copy.id)),
    })
  }

  return (
    <div className="flex flex-col pb-12">
      <BackLink to={`/kampagnen/${campaignId}`} label={campaign.data.name} />
      <div className="mt-6">
        <SectionHeading kicker={i.kicker} level={1}>
          {i.title}
        </SectionHeading>
      </div>
      <p className="mt-6 max-w-2xl text-dim">{i.intro}</p>
      <div className="mt-6">
        <ErrorAlert error={importing.error} />
      </div>
      {importable.data.length === 0 ? (
        <p className="mt-4 text-dim">{i.empty}</p>
      ) : (
        byCampaign(importable.data).map(([campaignName, group]) => (
          <CampaignGroup key={group[0]!.campaignId} title={campaignName}>
            {group.map((character) => (
              <li key={character.id} className="flex">
                <SheetCard
                  ring={ringColor({
                    kind: 'character',
                    colorIndex: nextColorIndex,
                    color: character.color,
                  })}
                  backdrop={CHARACTER_BACKDROP}
                  portraitUrl={character.portraitUrl}
                  portraitAlt={t.portraitAlt(character.name)}
                  name={character.name}
                  meta={
                    <>
                      {[character.species, character.characterClass].filter(Boolean).join(' · ') ||
                        de.sizes[character.size]}
                      {namesHere.has(character.name.toLocaleLowerCase('de-DE')) && (
                        <span className="block font-semibold text-candle">{i.alreadyHere}</span>
                      )}
                    </>
                  }
                  tagline={character.tagline}
                  action={
                    <Button
                      aria-label={i.buttonLabel(character.name)}
                      busy={importing.isPending && importing.variables === character.id}
                      disabled={importing.isPending}
                      className="w-full"
                      onClick={() => take(character)}
                    >
                      {i.button}
                    </Button>
                  }
                />
              </li>
            ))}
          </CampaignGroup>
        ))
      )}
    </div>
  )
}

/** The characters by their campaign, in the server's order (campaign, then name). */
function byCampaign(characters: ImportableCharacter[]): [string, ImportableCharacter[]][] {
  const groups = new Map<string, [string, ImportableCharacter[]]>()
  for (const character of characters) {
    const group = groups.get(character.campaignId) ?? [character.campaignName, []]
    group[1].push(character)
    groups.set(character.campaignId, group)
  }
  return [...groups.values()]
}

function CampaignGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-12">
      <SectionTitle id={id}>{title}</SectionTitle>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {children}
      </ul>
    </section>
  )
}
