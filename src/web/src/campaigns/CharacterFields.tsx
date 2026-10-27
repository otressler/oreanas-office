// The parts of a character's fields that the new-character form and the character page's
// edit mode share: whom it belongs to and its ring colour.
import { useId, useState } from 'react'
import type { CreatureSize, Member } from '../api/types'
import { CHARACTER_RINGS, parseHexColor } from '../board/palette'
import { inputClass } from '../components/styles'
import { SelectField } from '../components/ui'
import { de } from '../text/de'

export const SIZES: CreatureSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']

const t = de.characters

/**
 * Whom a character can be given to: only `dm` members get the field
 * (knowledge/domain/character.md). `me` owns a new character unless another is picked.
 */
export interface OwnerChoice {
  members: Member[]
  me: string
}

/** Whom the character belongs to, picked from the campaign's members. */
export function OwnerField({
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
 * The ring colour: the default colours as swatches with the chosen one marked, and a "+"
 * swatch that opens a hex field for any other colour. Empty keeps the colour by the order
 * characters were added (`fallback`, unknown for a new character), which marks its swatch
 * too. Characters may share a colour.
 */
export function ColorField({
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
  const [customOpen, setCustomOpen] = useState(false)
  const picked = parseHexColor(value)
  const shown = picked ?? (value.trim() ? null : fallback)
  const isPreset = CHARACTER_RINGS.some((ring) => ring === picked)
  const custom = customOpen || invalid || (value.trim() !== '' && !isPreset)
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-sm text-dim">
        {c.label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {CHARACTER_RINGS.map((ring, index) => (
          <button
            key={ring}
            type="button"
            aria-label={c.pick(c.swatches[index] ?? ring)}
            aria-pressed={shown === ring}
            title={ring}
            className="size-9 rounded-full border-2 border-line aria-pressed:border-parchment aria-pressed:ring-2 aria-pressed:ring-candle"
            style={{ backgroundColor: ring }}
            onClick={() => onChange(ring)}
          />
        ))}
        <button
          type="button"
          aria-label={c.addCustom}
          aria-pressed={custom}
          title={c.addCustom}
          className="flex size-9 items-center justify-center rounded-full border-2 border-dashed border-line text-lg text-dim aria-pressed:border-parchment aria-pressed:text-parchment"
          onClick={() => setCustomOpen((open) => !open)}
        >
          +
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-8 shrink-0 rounded-full border-4 bg-table"
            style={{ borderColor: shown ?? 'transparent' }}
          />
          <input
            id={id}
            aria-label={c.custom}
            value={value}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            placeholder="#4da3ff"
            aria-describedby={`${id}-hint`}
            aria-invalid={invalid || undefined}
            className={`${inputClass} w-36 font-mono`}
            onChange={(event) => {
              // Stays open while it is emptied or typed over.
              setCustomOpen(true)
              onChange(event.target.value)
            }}
            onBlur={onBlur}
          />
        </div>
      )}
      <p id={`${id}-hint`} className={`text-sm ${invalid ? 'text-red-200' : 'text-dim'}`}>
        {invalid ? c.invalid : value === '' ? c.automaticHint : null}
        {!invalid && value !== '' && (
          <button type="button" className="underline" onClick={() => onChange('')}>
            {c.reset}
          </button>
        )}
      </p>
    </div>
  )
}
