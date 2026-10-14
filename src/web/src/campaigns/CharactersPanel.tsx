import { useState } from 'react'
import type { Character } from '../api/types'
import { Button, LoadError, Loading, Panel } from '../components/ui'
import { de } from '../text/de'
import { CharacterForm } from './CharacterForm'
import { useCharacters } from './queries'

/** The campaign's characters; players edit their own, `dm` members any (`canEdit`). */
export function CharactersPanel({ campaignId }: { campaignId: string }) {
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
      {adding && <CharacterForm campaignId={campaignId} onDone={() => setAdding(false)} />}
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
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <CharacterRow
                key={character.id}
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

function CharacterRow({ character, onEdit }: { character: Character; onEdit: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="font-semibold text-parchment">{character.name}</span>
        <span className="text-sm text-dim">{de.characters.owner(character.ownerDisplayName)}</span>
      </div>
      <span className="text-sm text-dim">{de.sizes[character.size]}</span>
      {character.canEdit && (
        <Button
          className="ml-auto"
          variant="quiet"
          onClick={onEdit}
          aria-label={de.characters.editTitle(character.name)}
        >
          {de.common.edit}
        </Button>
      )}
    </li>
  )
}
