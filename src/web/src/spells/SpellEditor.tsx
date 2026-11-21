// The card editor (knowledge/features/spell-cards.md, "Creating a spell"): the fields on one
// side, the card live on the other, one bar to save. Used for new spells, drafts from the wiki
// or a photo, "Eigene Variante" and editing one's own variant.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type {
  SpellCard,
  SpellChipKind,
  SpellEffect,
  SpellSchool,
  SpellVariantOrigin,
  SpellWriteIn,
} from '../api/types'
import { EditBar, TextArea } from '../components/sheet'
import { inputClass } from '../components/styles'
import { Button, SelectField, TextField } from '../components/ui'
import { useLeaveWarning } from '../components/useLeaveWarning'
import { de } from '../text/de'
import { SCHOOLS, SPELL_ICON_NAMES, SPELL_LIMITS } from './model'
import { SpellCardView, SpellIcon } from './SpellCard'

const t = de.spells
const e = t.editor

const CHIP_KINDS = Object.keys(t.chipKinds) as SpellChipKind[]
const WRITE_INS: SpellWriteIn[] = ['attack', 'saveDc', 'modifier']

/** What the editor changes: the spell's facts and the card. */
export interface SpellEdit {
  nameEn: string
  level: number
  school: SpellSchool
  card: SpellCard
  origin: SpellVariantOrigin
}

export function SpellEditor({
  initial,
  factsLocked,
  intro,
  error,
  busy,
  onSave,
  onCancel,
}: {
  initial: SpellEdit
  /** The spell exists already: its English name, level and school can't change here. */
  factsLocked: boolean
  intro?: ReactNode
  error: unknown
  busy: boolean
  onSave: (edit: SpellEdit) => void
  onCancel: () => void
}) {
  const [edit, setEdit] = useState(initial)
  const [overflow, setOverflow] = useState(false)
  const [side, setSide] = useState<'front' | 'back'>('back')
  const dirty = JSON.stringify(edit) !== JSON.stringify(initial)
  // Saving and cancelling leave the page on purpose; a failed save stays and warns again.
  const leaving = useRef(false)
  useEffect(() => {
    leaving.current = false
  }, [error])
  useLeaveWarning(dirty, () => busy || leaving.current)

  const card = edit.card
  const set = (patch: Partial<SpellCard>) =>
    setEdit((current) => ({ ...current, card: { ...current.card, ...patch } }))
  const effects = card.effects ?? []
  const setEffect = (index: number, patch: Partial<SpellEffect>) =>
    set({ effects: effects.map((effect, i) => (i === index ? { ...effect, ...patch } : effect)) })
  const pips = card.pips ?? []
  const writeIns = card.writeIns ?? []

  const spell = {
    nameEn: edit.nameEn || '—',
    level: edit.level,
    school: edit.school,
    card: { ...card, name: card.name || '—' },
  }
  const canSave = edit.nameEn.trim() !== '' && card.name.trim() !== ''

  return (
    <div className="flex flex-col pb-4">
      {intro}
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-6">
          <Fieldset legend={de.spells.library.title}>
            <TextField
              label={e.nameEn}
              hint={factsLocked ? e.factsFixed : e.nameEnHint}
              value={edit.nameEn}
              maxLength={SPELL_LIMITS.nameEn}
              disabled={factsLocked}
              onChange={(event) => setEdit({ ...edit, nameEn: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label={e.level}
                value={edit.level}
                disabled={factsLocked}
                onChange={(event) => setEdit({ ...edit, level: Number(event.target.value) })}
              >
                {Array.from({ length: 10 }, (_, level) => (
                  <option key={level} value={level}>
                    {t.level(level)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={e.school}
                value={edit.school}
                disabled={factsLocked}
                onChange={(event) =>
                  setEdit({ ...edit, school: event.target.value as SpellSchool })
                }
              >
                {SCHOOLS.map((school) => (
                  <option key={school} value={school}>
                    {t.schools[school]}
                  </option>
                ))}
              </SelectField>
            </div>
          </Fieldset>

          <Fieldset legend={e.name}>
            <TextField
              label={e.name}
              value={card.name}
              maxLength={SPELL_LIMITS.name}
              onChange={(event) => set({ name: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              {(['castingTime', 'range', 'components', 'duration'] as const).map((key) => (
                <TextField
                  key={key}
                  label={e[key]}
                  value={card[key] ?? ''}
                  maxLength={SPELL_LIMITS.stat}
                  onChange={(event) => set({ [key]: event.target.value })}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Check
                label={e.concentration}
                checked={!!card.concentration}
                onChange={(concentration) => set({ concentration })}
              />
              <Check
                label={e.ritual}
                checked={!!card.ritual}
                onChange={(ritual) => set({ ritual })}
              />
            </div>
          </Fieldset>

          <TextArea
            label={e.description}
            hint={e.descriptionHint}
            rows={6}
            max={SPELL_LIMITS.description}
            value={card.description ?? ''}
            onChange={(description) => set({ description })}
          />

          <Fieldset legend={e.effects} hint={e.effectsHint}>
            {effects.map((effect, index) => (
              <EffectFields
                key={index}
                effect={effect}
                onChange={(patch) => setEffect(index, patch)}
                onRemove={() => set({ effects: effects.filter((_, i) => i !== index) })}
              />
            ))}
            {effects.length < SPELL_LIMITS.effects && (
              <Button
                className="self-start"
                onClick={() =>
                  set({
                    effects: [
                      ...effects,
                      { icon: card.icon ?? 'spark', title: '', text: '', tag: null, chip: null },
                    ],
                  })
                }
              >
                {e.addEffect}
              </Button>
            )}
          </Fieldset>

          <Fieldset legend={e.cardIcon}>
            <div className="flex flex-wrap items-end gap-4">
              <IconPicker
                label={e.cardIcon}
                value={card.icon ?? 'spark'}
                onChange={(icon) => set({ icon: icon ?? 'spark' })}
              />
              {[0, 1].map((index) => (
                <IconPicker
                  key={index}
                  label={`${e.pips} ${index + 1}`}
                  value={pips[index] ?? null}
                  allowNone
                  onChange={(icon) => {
                    const next = [...pips]
                    if (icon) next[index] = icon
                    else next.splice(index, 1)
                    set({ pips: next.filter(Boolean).slice(0, 2) })
                  }}
                />
              ))}
            </div>
          </Fieldset>

          <TextArea
            label={e.higherLevels}
            hint={e.higherLevelsHint(edit.level === 0)}
            rows={2}
            max={SPELL_LIMITS.higherLevels}
            value={card.higherLevels ?? ''}
            onChange={(higherLevels) => set({ higherLevels })}
          />
          <TextArea
            label={e.tip}
            hint=""
            rows={2}
            max={SPELL_LIMITS.tip}
            value={card.tip ?? ''}
            onChange={(tip) => set({ tip })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={e.material}
              value={card.material ?? ''}
              maxLength={SPELL_LIMITS.material}
              onChange={(event) => set({ material: event.target.value })}
            />
            <TextField
              label={e.source}
              hint={e.sourceHint}
              value={card.source ?? ''}
              maxLength={SPELL_LIMITS.source}
              onChange={(event) => set({ source: event.target.value })}
            />
          </div>
          <Fieldset legend={e.writeIns}>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {WRITE_INS.map((writeIn) => (
                <Check
                  key={writeIn}
                  label={t.card.writeIns[writeIn]}
                  checked={writeIns.includes(writeIn)}
                  onChange={(on) =>
                    set({
                      writeIns: on ? [...writeIns, writeIn] : writeIns.filter((w) => w !== writeIn),
                    })
                  }
                />
              ))}
            </div>
          </Fieldset>
        </div>

        <aside aria-label={e.preview} className="order-first lg:order-none">
          <div className="flex flex-col items-center gap-3 lg:sticky lg:top-4">
            <div className="flex gap-2" role="group" aria-label={e.preview}>
              <Button
                variant={side === 'front' ? 'primary' : 'secondary'}
                aria-pressed={side === 'front'}
                onClick={() => setSide('front')}
              >
                {e.front}
              </Button>
              <Button
                variant={side === 'back' ? 'primary' : 'secondary'}
                aria-pressed={side === 'back'}
                onClick={() => setSide('back')}
              >
                {e.back}
              </Button>
            </div>
            <SpellCardView
              spell={spell}
              side={side}
              zoom={1.25}
              onOverflow={side === 'back' ? setOverflow : undefined}
            />
            {overflow && side === 'back' && (
              <p role="status" className="max-w-xs text-center text-sm text-candle">
                {t.card.overflow}
              </p>
            )}
          </div>
        </aside>
      </div>
      <EditBar
        label={e.save}
        error={error}
        dirty={dirty}
        busy={busy}
        onCancel={() => {
          leaving.current = true
          onCancel()
        }}
        onSave={() => {
          if (!canSave) return
          leaving.current = true
          onSave(trimmed(edit))
        }}
        extra={
          !canSave ? (
            <span className="text-sm text-dim">
              {e.nameEn} · {e.name}
            </span>
          ) : undefined
        }
      />
    </div>
  )
}

function trimmed(edit: SpellEdit): SpellEdit {
  const card = edit.card
  return {
    ...edit,
    nameEn: edit.nameEn.trim(),
    card: {
      ...card,
      name: card.name.trim(),
      effects: (card.effects ?? [])
        .filter((effect) => effect.title.trim())
        .map((effect) => ({
          ...effect,
          tag: effect.tag?.trim() || null,
          chip: effect.chip?.big.trim() ? effect.chip : null,
        })),
    },
  }
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string
  hint?: string
  children: ReactNode
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-panel/60 p-4">
      <legend className="px-1 font-display text-sm font-semibold tracking-wider text-candle">
        {legend}
      </legend>
      {hint && <p className="-mt-1 text-sm text-dim">{hint}</p>}
      {children}
    </fieldset>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-parchment">
      <input
        type="checkbox"
        className="size-5 accent-candle"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function EffectFields({
  effect,
  onChange,
  onRemove,
}: {
  effect: SpellEffect
  onChange: (patch: Partial<SpellEffect>) => void
  onRemove: () => void
}) {
  const chip = effect.chip ?? null
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <IconPicker
          label={e.icon}
          value={effect.icon}
          onChange={(icon) => onChange({ icon: icon ?? 'spark' })}
        />
        <TextField
          className="min-w-40 flex-1"
          label={e.effectTitle}
          value={effect.title}
          maxLength={SPELL_LIMITS.effectTitle}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <TextField
          className="w-40"
          label={e.effectTag}
          placeholder={e.effectTagPlaceholder}
          value={effect.tag ?? ''}
          maxLength={SPELL_LIMITS.effectTag}
          onChange={(event) => onChange({ tag: event.target.value })}
        />
        <Button variant="quiet" onClick={onRemove} aria-label={e.removeEffect}>
          ✕
        </Button>
      </div>
      <TextField
        label={e.effectText}
        value={effect.text ?? ''}
        maxLength={SPELL_LIMITS.effectText}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <div className="grid grid-cols-3 gap-3">
        <TextField
          label={e.chipBig}
          placeholder={e.chipBigPlaceholder}
          value={chip?.big ?? ''}
          maxLength={SPELL_LIMITS.chipBig}
          onChange={(event) => onChange({ chip: { ...(chip ?? {}), big: event.target.value } })}
        />
        <TextField
          label={e.chipSmall}
          value={chip?.small ?? ''}
          maxLength={SPELL_LIMITS.chipSmall}
          disabled={!chip?.big}
          onChange={(event) =>
            onChange({ chip: { big: chip?.big ?? '', ...chip, small: event.target.value } })
          }
        />
        <SelectField
          label={e.chipKind}
          value={chip?.kind ?? ''}
          disabled={!chip?.big}
          onChange={(event) =>
            onChange({
              chip: {
                big: chip?.big ?? '',
                ...chip,
                kind: (event.target.value || null) as SpellChipKind | null,
              },
            })
          }
        >
          <option value="">{e.chipPlain}</option>
          {CHIP_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t.chipKinds[kind]}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  )
}

/** A button showing the icon; it opens a grid of all icons to pick from. */
function IconPicker({
  label,
  value,
  allowNone = false,
  onChange,
}: {
  label: string
  value: string | null
  allowNone?: boolean
  onChange: (icon: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="relative flex flex-col gap-1">
      <span id={id} className="text-sm text-dim">
        {label}
      </span>
      <button
        type="button"
        aria-labelledby={id}
        aria-expanded={open}
        className={`${inputClass} spell-icon-button flex h-11 w-14 items-center justify-center text-candle`}
        onClick={() => setOpen(!open)}
      >
        {value ? <IconGlyph name={value} /> : <span className="text-xs text-dim">{e.pipNone}</span>}
      </button>
      {open && (
        <div
          role="listbox"
          aria-labelledby={id}
          className="absolute top-full left-0 z-20 mt-1 grid w-72 grid-cols-7 gap-1 rounded-lg border border-line bg-panel p-2 shadow-xl"
        >
          {allowNone && (
            <button
              type="button"
              role="option"
              aria-selected={value == null}
              className="col-span-7 min-h-9 rounded text-sm text-dim hover:bg-line/40"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              {e.pipNone}
            </button>
          )}
          {SPELL_ICON_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={value === name}
              aria-label={name}
              title={name}
              className={`flex size-9 items-center justify-center rounded text-candle hover:bg-line/40 ${value === name ? 'bg-candle/20 ring-1 ring-candle' : ''}`}
              onClick={() => {
                onChange(name)
                setOpen(false)
              }}
            >
              <IconGlyph name={name} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IconGlyph({ name }: { name: string }) {
  return (
    <span className="spell-glyph inline-flex size-6 [&_.sc-icon]:size-6">
      <SpellIcon name={name} />
    </span>
  )
}
