import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { Character, CharacterRequest, CreatureSize } from '../api/types'
import { Button, ErrorAlert, SelectField, TextField } from '../components/ui'
import { de } from '../text/de'
import { campaignKeys } from './queries'
import { limits } from '../lib/limits'

const SIZES: CreatureSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
/** Creates a character, or edits one when `character` is given. */
export function CharacterForm({
  campaignId,
  character,
  onDone,
}: {
  campaignId: string
  character?: Character
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()
  const [name, setName] = useState(character?.name ?? '')
  const [size, setSize] = useState<CreatureSize>(character?.size ?? 'medium')

  const save = useMutation({
    mutationFn: (body: CharacterRequest) =>
      unwrap(
        character
          ? api.PUT('/api/campaigns/{campaignId}/characters/{characterId}', {
              params: { path: { campaignId, characterId: character.id } },
              body,
            })
          : api.POST('/api/campaigns/{campaignId}/characters', {
              params: { path: { campaignId } },
              body,
            }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: campaignKeys.characters(campaignId) })
      onDone()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate({ name: name.trim(), size })
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${formId}-title`}
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <h3 id={`${formId}-title`} className="font-semibold text-parchment">
        {character ? de.characters.editTitle(character.name) : de.characters.add}
      </h3>
      <TextField
        label={de.characters.name}
        required
        maxLength={limits.characterName}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        label={de.characters.size}
        value={size}
        onChange={(event) => setSize(event.target.value as CreatureSize)}
      >
        {SIZES.map((value) => (
          <option key={value} value={value}>
            {de.sizes[value]}
          </option>
        ))}
      </SelectField>
      <ErrorAlert error={save.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={save.isPending}>
          {character ? de.common.save : de.common.create}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  )
}
