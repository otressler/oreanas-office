// Creates a character, or edits one: name, size and the appearance that feeds the portrait
// prompt. An existing character the user may edit also shows its portraits
// (knowledge/features/token-icons.md), outside the form element.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { errorMessage, unwrap } from '../api/errors'
import type { Character, CharacterRequest, CreatureSize } from '../api/types'
import { ringColor } from '../board/palette'
import { Button, ErrorAlert, SelectField, TextField } from '../components/ui'
import { inputClass } from '../components/styles'
import { de } from '../text/de'
import { TokenImageGallery, type Prepared } from '../tokenImages/TokenImageGallery'
import { campaignKeys } from './queries'
import { limits } from '../lib/limits'

const SIZES: CreatureSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
/** Character.AppearanceMaxLength */
export const CHARACTER_APPEARANCE_MAX = 500

const t = de.characters

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
  const appearanceId = useId()
  const [name, setName] = useState(character?.name ?? '')
  const [size, setSize] = useState<CreatureSize>(character?.size ?? 'medium')
  const [appearance, setAppearance] = useState(character?.appearance ?? '')

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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignKeys.characters(campaignId) }),
  })

  const request = (): CharacterRequest => ({
    name: name.trim(),
    size,
    appearance: appearance.trim(),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate(request(), { onSuccess: onDone })
  }

  /** Before a portrait job: saves changed fields first, since the server paints from its copy. */
  async function prepare(progress: (text: string) => void): Promise<Prepared> {
    if (!character) return { error: de.requestErrors.unknown }
    const body = request()
    const changed =
      body.name !== character.name ||
      body.size !== character.size ||
      body.appearance !== character.appearance
    if (changed) {
      if (!body.name) return { error: de.errors.nameInvalid }
      progress(t.portrait.saving)
      try {
        await save.mutateAsync(body)
      } catch (error) {
        return { error: errorMessage(error) }
      }
    }
    return { body: {} }
  }

  const appearanceLength = Array.from(appearance).length

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <form onSubmit={submit} aria-labelledby={`${formId}-title`} className="flex flex-col gap-3">
        <h3 id={`${formId}-title`} className="font-semibold text-parchment">
          {character ? t.editTitle(character.name) : t.add}
        </h3>
        <TextField
          label={t.name}
          required
          maxLength={limits.characterName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          label={t.size}
          value={size}
          onChange={(event) => setSize(event.target.value as CreatureSize)}
        >
          {SIZES.map((value) => (
            <option key={value} value={value}>
              {de.sizes[value]}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-1">
          <label htmlFor={appearanceId} className="text-sm text-dim">
            {t.appearance}
          </label>
          <textarea
            id={appearanceId}
            rows={3}
            value={appearance}
            maxLength={CHARACTER_APPEARANCE_MAX}
            aria-describedby={`${appearanceId}-hint`}
            className={`${inputClass} resize-y`}
            onChange={(event) => setAppearance(event.target.value)}
          />
          <p id={`${appearanceId}-hint`} className="text-sm text-dim">
            {t.appearanceHint} ({appearanceLength}/{CHARACTER_APPEARANCE_MAX})
          </p>
        </div>
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
      {character?.canEdit && (
        <section
          aria-label={t.portrait.title}
          className="flex flex-col gap-2 border-t border-line pt-3"
        >
          <h4 className="font-semibold text-parchment">{t.portrait.title}</h4>
          <p className="text-sm text-dim">{t.portrait.help}</p>
          <TokenImageGallery
            campaignId={campaignId}
            owner={{ type: 'character', id: character.id }}
            name={character.name}
            ring={ringColor({ kind: 'character', colorIndex: character.colorIndex })}
            generateLabel={t.portrait.generate}
            regenerateLabel={t.portrait.regenerate}
            generateHint={appearance.trim() ? null : t.portrait.needsAppearance}
            prepare={prepare}
            uploads
          />
        </section>
      )}
    </div>
  )
}
