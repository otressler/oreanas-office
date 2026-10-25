import { useId, useState } from 'react'
import type { Campaign, Character } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { ringColor } from '../board/palette'
import { Button, LoadError, Loading, Panel } from '../components/ui'
import { StatusListEditor } from '../statuses/StatusListEditor'
import { de } from '../text/de'
import { TokenPicture } from '../tokenImages/TokenPicture'
import { CharacterForm, type OwnerChoice } from './CharacterForm'
import { useCharacters } from './queries'

/**
 * The campaign's characters; players edit their own, `dm` members any (`canEdit`) and also
 * pick whom each belongs to.
 */
export function CharactersPanel({ campaign }: { campaign: Campaign }) {
  const campaignId = campaign.id
  const me = useCurrentUser()
  const owners: OwnerChoice | undefined =
    campaign.myRole === 'dm' ? { members: campaign.members, me: me.id } : undefined
  const characters = useCharacters(campaignId)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <Panel
      title={de.characters.title}
      action={
        !adding && (
          <Button onClick={() => setAdding(true)} variant="secondary">
            {de.characters.add}
          </Button>
        )
      }
    >
      {adding && (
        <CharacterForm campaignId={campaignId} owners={owners} onDone={() => setAdding(false)} />
      )}
      {characters.isPending ? (
        <Loading />
      ) : characters.isError ? (
        <LoadError error={characters.error} onRetry={() => void characters.refetch()} />
      ) : characters.data.length === 0 ? (
        !adding && <p className="text-dim">{de.characters.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {characters.data.map((character) =>
            editingId === character.id ? (
              <li key={character.id} className="py-2">
                <CharacterForm
                  campaignId={campaignId}
                  character={character}
                  owners={owners}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <CharacterRow
                key={character.id}
                campaignId={campaignId}
                character={character}
                onEdit={() => setEditingId(character.id)}
              />
            ),
          )}
        </ul>
      )}
    </Panel>
  )
}

function CharacterRow({
  campaignId,
  character,
  onEdit,
}: {
  campaignId: string
  character: Character
  onEdit: () => void
}) {
  // The character's status list (stage 9): everyone reads it, its editors change it.
  const [statuses, setStatuses] = useState(false)
  const listId = useId()
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TokenPicture
          url={character.portraitUrl}
          label={character.name}
          ring={ringColor({ kind: 'character', ...character })}
          alt={de.characters.portraitAlt(character.name)}
          className="h-11 w-11 text-base"
        />
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold text-parchment">{character.name}</span>
          <span className="text-sm text-dim">
            {de.characters.owner(character.ownerDisplayName)}
          </span>
        </div>
        <span className="text-sm text-dim">{de.sizes[character.size]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            variant="quiet"
            aria-expanded={statuses}
            aria-controls={statuses ? listId : undefined}
            aria-label={de.statuses.list.show(character.name)}
            onClick={() => setStatuses((open) => !open)}
          >
            {de.statuses.list.title}
          </Button>
          {character.canEdit && (
            <Button
              variant="quiet"
              onClick={onEdit}
              aria-label={de.characters.editTitle(character.name)}
            >
              {de.common.edit}
            </Button>
          )}
        </div>
      </div>
      {statuses && (
        <section
          id={listId}
          aria-label={de.statuses.list.show(character.name)}
          className="flex flex-col gap-2 rounded-lg border border-line p-3"
        >
          <h3 className="font-semibold text-parchment">{de.statuses.list.title}</h3>
          <p className="text-sm text-dim">{de.statuses.list.help}</p>
          <StatusListEditor
            campaignId={campaignId}
            owner={{ kind: 'character', characterId: character.id }}
          />
        </section>
      )}
    </li>
  )
}
