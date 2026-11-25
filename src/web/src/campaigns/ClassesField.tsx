// A character's classes on its page's editor (knowledge/domain/character.md): Handbook classes,
// each once, with a level and, from level 3, a subclass of that class. Several classes are
// multiclassing; the first is the one the character started with.
import { useId } from 'react'
import type { CharacterClassEntry } from '../api/types'
import { Button, ErrorAlert, SelectField } from '../components/ui'
import { CLASS_LIMITS, totalLevel, useClasses } from '../rules/classes'
import { de } from '../text/de'

const t = de.characters.classes

export function ClassesField({
  value,
  onChange,
}: {
  value: CharacterClassEntry[]
  onChange: (value: CharacterClassEntry[]) => void
}) {
  const classes = useClasses()
  const hintId = useId()
  const total = totalLevel(value)
  const used = new Set(value.map((entry) => entry.classId))
  const unused = (classes.data ?? []).filter((c) => !used.has(c.id))

  const change = (index: number, patch: Partial<CharacterClassEntry>) =>
    onChange(
      value.map((entry, i) => {
        if (i !== index) return entry
        const next = { ...entry, ...patch }
        // A subclass belongs to its class and comes at level 3.
        if (next.classId !== entry.classId || next.level < CLASS_LIMITS.subclassLevel)
          next.subclassId = null
        return next
      }),
    )

  return (
    <fieldset aria-describedby={hintId} className="flex flex-col gap-3">
      <legend className="text-sm text-dim">{t.title}</legend>
      <p id={hintId} className="-mt-1 text-sm text-dim">
        {t.hint}
      </p>
      {classes.isError && <ErrorAlert error={classes.error} />}
      {value.length === 0 && <p className="text-parchment/80">{t.none}</p>}
      <ul className="flex flex-col gap-3">
        {value.map((entry, index) => {
          const info = classes.data?.find((c) => c.id === entry.classId)
          const name = info?.nameDe ?? entry.classId
          const subclassOpen = entry.level >= CLASS_LIMITS.subclassLevel
          return (
            <li
              key={entry.classId}
              className="grid items-end gap-3 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,1.2fr)_6rem_minmax(0,1.5fr)_auto]"
            >
              <SelectField
                label={t.className}
                value={entry.classId}
                onChange={(event) => change(index, { classId: event.target.value })}
              >
                <option value={entry.classId}>{name}</option>
                {unused.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameDe}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t.level}
                value={entry.level}
                onChange={(event) => change(index, { level: Number(event.target.value) })}
              >
                {Array.from({ length: CLASS_LIMITS.maxLevel }, (_, i) => i + 1).map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t.subclass}
                value={entry.subclassId ?? ''}
                disabled={!subclassOpen}
                title={subclassOpen ? undefined : t.subclassFrom}
                onChange={(event) => change(index, { subclassId: event.target.value || null })}
              >
                <option value="">{subclassOpen ? t.noSubclass : t.subclassFrom}</option>
                {subclassOpen &&
                  info?.subclasses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameDe}
                    </option>
                  ))}
              </SelectField>
              <Button
                variant="quiet"
                aria-label={t.remove(name)}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                {t.removeShort}
              </Button>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={unused.length === 0 || total >= CLASS_LIMITS.maxLevel}
          onClick={() =>
            onChange([...value, { classId: unused[0].id, level: 1, subclassId: null }])
          }
        >
          {value.length === 0 ? t.addFirst : t.add}
        </Button>
        {value.length > 0 && (
          <span
            className={`text-sm ${total > CLASS_LIMITS.maxLevel ? 'text-red-300' : 'text-dim'}`}
            role={total > CLASS_LIMITS.maxLevel ? 'alert' : undefined}
          >
            {total > CLASS_LIMITS.maxLevel ? t.tooHigh(total) : t.total(total)}
          </span>
        )}
      </div>
    </fieldset>
  )
}
