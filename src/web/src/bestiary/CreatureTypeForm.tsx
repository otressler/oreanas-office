// The form for a creature type (knowledge/domain/creature-type.md): name, size, the
// appearance that feeds the icon prompt, and the DM's notes. It writes to the browser; the
// name must be free in the campaign, ignoring case. An existing type also shows its icons
// (CreatureIconSection), outside the form element.
import { useId, useState, type FormEvent } from 'react'
import type { CreatureSize } from '../api/types'
import { footprint } from '../board/geometry'
import { Button, ErrorAlert, SelectField, TextField } from '../components/ui'
import { inputClass } from '../components/styles'
import { useLocalUser } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { de } from '../text/de'
import { CreatureIconSection } from './CreatureIconSection'
import {
  CREATURE_APPEARANCE_MAX,
  CREATURE_NOTES_MAX,
  CREATURE_SIZES,
  checkCreatureType,
  createCreatureType,
  saveCreatureType,
  setCreatureTypeArchived,
  useCreatureTypes,
  type CreatureTypeProblem,
} from './creatureTypes'

const t = de.bestiary

/** Creates a creature type, or edits `type`. `onSaved` gets the stored record. */
export function CreatureTypeForm({
  campaignId,
  type,
  onSaved,
  onCancel,
  onArchived,
}: {
  campaignId: string
  type?: LocalCreatureType
  onSaved: (type: LocalCreatureType) => void
  onCancel: () => void
  /** Called after the type was archived from this form. */
  onArchived?: (type: LocalCreatureType) => void
}) {
  const { db } = useLocalUser()
  const formId = useId()
  const types = useCreatureTypes(db, campaignId)
  const [name, setName] = useState(type?.name ?? '')
  const [size, setSize] = useState<CreatureSize>(type?.size ?? 'medium')
  const [appearance, setAppearance] = useState(type?.appearance ?? '')
  const [notes, setNotes] = useState(type?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [failed, setFailed] = useState(false)

  const input = { name, size, appearance, notes }
  const others = (types ?? []).filter((other) => other.id !== type?.id)
  const problems = checkCreatureType(input, others)
  // An empty name isn't an error before the DM tried to save.
  const shown = problems.filter((problem) => submitted || problem !== 'nameMissing')
  const has = (problem: CreatureTypeProblem) => shown.includes(problem)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (problems.length > 0 || types === undefined) return
    try {
      const result = type
        ? await saveCreatureType(db, type.id, input)
        : await createCreatureType(db, campaignId, input)
      if (result.ok) onSaved(result.type)
      else setFailed(true)
    } catch {
      setFailed(true)
    }
  }

  /**
   * Before an icon job: writes edits the DM hasn't saved yet, without closing the form.
   * False (and the problems shown) when they can't be saved.
   */
  async function saveDraft(): Promise<boolean> {
    if (!type) return false
    const unchanged =
      name.trim() === type.name &&
      size === type.size &&
      appearance === type.appearance &&
      notes === type.notes
    if (unchanged) return true
    setSubmitted(true)
    if (problems.length > 0) return false
    try {
      const result = await saveCreatureType(db, type.id, input)
      if (!result.ok) setFailed(true)
      return result.ok
    } catch {
      setFailed(true)
      return false
    }
  }

  async function archive() {
    if (!type) return
    await setCreatureTypeArchived(db, type.id, true)
    onArchived?.({ ...type, archivedAt: new Date().toISOString() })
  }

  const nameProblem = has('nameMissing')
    ? t.problems.nameMissing
    : has('nameTooLong')
      ? t.problems.nameTooLong
      : has('nameTaken')
        ? t.problems.nameTaken
        : undefined

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <form onSubmit={submit} aria-labelledby={`${formId}-title`} className="flex flex-col gap-3">
        <h3 id={`${formId}-title`} className="font-semibold text-parchment">
          {type ? t.editTitle(type.name) : t.newTitle}
        </h3>
        <TextField
          label={t.name}
          value={name}
          autoComplete="off"
          invalid={nameProblem !== undefined}
          hint={nameProblem ?? t.nameHint}
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          label={t.size}
          value={size}
          onChange={(event) => setSize(event.target.value as CreatureSize)}
        >
          {CREATURE_SIZES.map((value) => (
            <option key={value} value={value}>
              {t.sizeOption(de.sizes[value], footprint(value))}
            </option>
          ))}
        </SelectField>
        <TextArea
          label={t.appearance}
          value={appearance}
          max={CREATURE_APPEARANCE_MAX}
          hint={has('appearanceTooLong') ? t.problems.appearanceTooLong : t.appearanceHint}
          invalid={has('appearanceTooLong')}
          onChange={setAppearance}
        />
        <TextArea
          label={t.notes}
          value={notes}
          max={CREATURE_NOTES_MAX}
          hint={has('notesTooLong') ? t.problems.notesTooLong : t.notesHint}
          invalid={has('notesTooLong')}
          onChange={setNotes}
        />
        {failed && <ErrorAlert error={t.saveFailed} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            {type ? t.save : t.create}
          </Button>
          <Button variant="quiet" onClick={onCancel}>
            {t.cancel}
          </Button>
          {type && (
            <Button variant="quiet" className="ml-auto" onClick={() => void archive()}>
              {t.archive}
            </Button>
          )}
        </div>
      </form>
      {type && <CreatureIconSection campaignId={campaignId} type={type} saveDraft={saveDraft} />}
    </div>
  )
}

function TextArea({
  label,
  value,
  max,
  hint,
  invalid,
  onChange,
}: {
  label: string
  value: string
  max: number
  hint: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        className={`${inputClass} resize-y`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className={`text-sm ${invalid ? 'text-red-300' : 'text-dim'}`}>
        {hint} ({Array.from(value).length}/{max})
      </p>
    </div>
  )
}
