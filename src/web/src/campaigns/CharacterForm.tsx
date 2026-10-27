// Creates a character, or edits one: name, size, ring colour and the appearance that
// feeds the portrait prompt; for `dm` members also whom it belongs to. An existing character the user may edit also shows its portraits
// (knowledge/features/token-icons.md), outside the form element.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { errorMessage, unwrap } from '../api/errors'
import type { Character, CharacterRequest, CreatureSize, Member } from '../api/types'
import { CHARACTER_RINGS, defaultRingColor, parseHexColor, ringColor } from '../board/palette'
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

/**
 * Whom a character can be given to: only `dm` members get the field
 * (knowledge/domain/character.md). `me` owns a new character unless another is picked.
 */
export interface OwnerChoice {
  members: Member[]
  me: string
}

/** Creates a character, or edits one when `character` is given. */
export function CharacterForm({
  campaignId,
  character,
  owners,
  className = 'flex flex-col gap-3 rounded-lg border border-line p-3',
  onDone,
}: {
  campaignId: string
  character?: Character
  owners?: OwnerChoice
  /** The frame around form and portraits. */
  className?: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const formId = useId()
  const appearanceId = useId()
  const [name, setName] = useState(character?.name ?? '')
  const [size, setSize] = useState<CreatureSize>(character?.size ?? 'medium')
  const [appearance, setAppearance] = useState(character?.appearance ?? '')
  const [color, setColor] = useState(character?.color ?? '')
  const [colorTouched, setColorTouched] = useState(false)
  const [owner, setOwner] = useState(character?.ownerUserId ?? owners?.me ?? '')
  // Empty means the default colour; anything else must be a hex code.
  const pickedColor = parseHexColor(color)
  const colorInvalid = color.trim() !== '' && pickedColor === null

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
    color: pickedColor,
    // Without the field the server keeps the owner, or makes a new character the user's.
    ...(owners && { ownerUserId: owner }),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (colorInvalid) {
      setColorTouched(true)
      return
    }
    save.mutate(request(), { onSuccess: onDone })
  }

  /** Before a portrait job: saves changed fields first, since the server paints from its copy. */
  async function prepare(progress: (text: string) => void): Promise<Prepared> {
    if (!character) return { error: de.requestErrors.unknown }
    const body = request()
    const changed =
      body.name !== character.name ||
      body.size !== character.size ||
      body.appearance !== character.appearance ||
      body.color !== character.color ||
      (body.ownerUserId ?? character.ownerUserId) !== character.ownerUserId
    if (changed) {
      if (!body.name) return { error: de.errors.nameInvalid }
      if (colorInvalid) return { error: de.errors.colorInvalid }
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
    <div className={className}>
      <form onSubmit={submit} aria-labelledby={`${formId}-title`} className="flex flex-col gap-3">
        <h3 id={`${formId}-title`} className="font-display text-xl font-semibold text-parchment">
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
        {owners && <OwnerField members={owners.members} value={owner} onChange={setOwner} />}
        <ColorField
          value={color}
          fallback={character ? defaultRingColor(character.colorIndex) : null}
          invalid={colorTouched && colorInvalid}
          onChange={setColor}
          onBlur={() => setColorTouched(true)}
        />
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
            ring={ringColor({
              kind: 'character',
              colorIndex: character.colorIndex,
              color: pickedColor,
            })}
            generateLabel={t.portrait.generate}
            regenerateLabel={t.portrait.regenerate}
            generateHint={appearance.trim() ? null : t.portrait.needsAppearance}
            prepare={prepare}
            uploads
            restyles
          />
        </section>
      )}
    </div>
  )
}

/** Whom the character belongs to, picked from the campaign's members. */
function OwnerField({
  members,
  value,
  onChange,
}: {
  members: Member[]
  value: string
  onChange: (value: string) => void
}) {
  const hintId = useId()
  return (
    <div className="flex flex-col gap-1">
      <SelectField
        label={t.ownerField}
        value={value}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      >
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.displayName}
          </option>
        ))}
      </SelectField>
      <p id={hintId} className="text-sm text-dim">
        {t.ownerHint}
      </p>
    </div>
  )
}

/**
 * The ring colour as a hex code, with the default colours as buttons that fill it in.
 * Empty keeps the colour by the order characters were added (`fallback`, unknown for a
 * new character). Characters may share a colour.
 */
function ColorField({
  value,
  fallback,
  invalid,
  onChange,
  onBlur,
}: {
  value: string
  fallback: string | null
  invalid: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const id = useId()
  const c = t.color
  const picked = parseHexColor(value)
  const shown = picked ?? (value.trim() ? null : fallback)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {c.label}
      </label>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full border-4 bg-table"
          style={{ borderColor: shown ?? 'transparent' }}
        />
        <input
          id={id}
          value={value}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          placeholder={fallback ? `${fallback} (${c.automatic})` : c.automatic}
          aria-describedby={`${id}-hint`}
          aria-invalid={invalid || undefined}
          className={`${inputClass} w-44 font-mono`}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {CHARACTER_RINGS.map((ring, index) => (
          <button
            key={ring}
            type="button"
            aria-label={c.pick(c.swatches[index] ?? ring)}
            aria-pressed={picked === ring}
            title={ring}
            className="h-8 w-8 rounded-full border-2 border-line aria-pressed:border-parchment aria-pressed:ring-2 aria-pressed:ring-candle"
            style={{ backgroundColor: ring }}
            onClick={() => onChange(ring)}
          />
        ))}
        {value !== '' && (
          <button type="button" className="text-sm text-dim underline" onClick={() => onChange('')}>
            {c.reset}
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className={`text-sm ${invalid ? 'text-red-200' : 'text-dim'}`}>
        {invalid ? c.invalid : c.hint}
      </p>
    </div>
  )
}
