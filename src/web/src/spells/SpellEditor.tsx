// The card editor (knowledge/features/spell-cards.md, "Creating a spell"): the fields on one
// side, the card live on the other, one bar to save. Used for new spells, drafts from the wiki
// or a photo, "Eigene Variante" and editing one's own variant.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type {
  SpellCard,
  SpellChip,
  SpellChipKind,
  SpellEffect,
  SpellRowColor,
  SpellSchool,
  SpellTable,
  SpellTableRow,
  SpellVariantOrigin,
  SpellWriteIn,
} from '../api/types'
import { EditBar, TextArea } from '../components/sheet'
import { inputClass } from '../components/styles'
import { Button, SelectField, TextField } from '../components/ui'
import { useLeaveWarning } from '../components/useLeaveWarning'
import { de } from '../text/de'
import { nameForEditing, nameFromEditing, SPELL_ICON_NAMES, SPELL_LIMITS, searchKey } from './model'
import { useSpellLibrary } from './queries'
import { SpellCardView, SpellIcon } from './SpellCard'

const t = de.spells
const e = t.editor

const CHIP_KINDS = Object.keys(t.chipKinds) as SpellChipKind[]
const ROW_COLORS = Object.keys(t.rowColors) as SpellRowColor[]
const EMPTY_ROW: SpellTableRow = { key: '', color: null, title: '', text: '', chip: null }
const WRITE_INS: SpellWriteIn[] = ['attack', 'saveDc', 'modifier']

/**
 * What the editor changes: which Handbook spell the card is for (its id, with the English name,
 * level and school the library has for it) and the card.
 */
export interface SpellEdit {
  /** Null until the English name is one of the library's. */
  spellId: string | null
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
  /** The card is for a known spell already (a draft, a variant): it can't change here. */
  factsLocked: boolean
  intro?: ReactNode
  error: unknown
  busy: boolean
  onSave: (edit: SpellEdit) => void
  onCancel: () => void
}) {
  const [edit, setEdit] = useState(initial)
  const library = useSpellLibrary()
  const listId = useId()
  const [scrolls, setScrolls] = useState(false)
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
  const tables = card.tables ?? []
  const setTable = (index: number, table: SpellTable | null) =>
    set({
      tables: table
        ? tables.map((current, i) => (i === index ? table : current))
        : tables.filter((_, i) => i !== index),
    })
  const pips = card.pips ?? []
  const writeIns = card.writeIns ?? []

  /** Picks the library's spell of this English name, with its level and school. */
  const pickSpell = (nameEn: string) => {
    const match = library.data?.find((s) => searchKey(s.nameEn) === searchKey(nameEn.trim()))
    setEdit((current) =>
      match
        ? { ...current, nameEn, spellId: match.id, level: match.level, school: match.school }
        : { ...current, nameEn, spellId: null },
    )
  }
  const unknownName = !factsLocked && edit.nameEn.trim() !== '' && edit.spellId === null

  const spell = {
    nameEn: edit.nameEn || '—',
    level: edit.level,
    school: edit.school,
    card: { ...card, name: card.name || '—' },
  }
  const canSave = edit.spellId !== null && searchKey(card.name).trim() !== ''

  return (
    <div className="flex flex-col pb-4">
      {intro}
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-6">
          <Fieldset legend={de.spells.library.title}>
            <TextField
              label={e.nameEn}
              hint={unknownName ? e.nameEnUnknown : factsLocked ? e.factsFixed : e.nameEnHint}
              invalid={unknownName}
              value={edit.nameEn}
              maxLength={SPELL_LIMITS.nameEn}
              disabled={factsLocked}
              list={factsLocked ? undefined : listId}
              autoComplete="off"
              onChange={(event) => pickSpell(event.target.value)}
            />
            {!factsLocked && (
              <datalist id={listId}>
                {library.data?.map((s) => (
                  <option key={s.id} value={s.nameEn}>
                    {s.variantCount > 0 ? `${s.name} · ${t.library.variants(s.variantCount)}` : ''}
                  </option>
                ))}
              </datalist>
            )}
            <p className="text-sm text-dim">
              {e.level}: {edit.spellId || factsLocked ? t.level(edit.level) : '—'} · {e.school}:{' '}
              {edit.spellId || factsLocked ? t.schools[edit.school] : '—'}
            </p>
          </Fieldset>

          <Fieldset legend={e.name}>
            <TextField
              label={e.name}
              hint={e.nameHint}
              value={nameForEditing(card.name)}
              maxLength={SPELL_LIMITS.name}
              onChange={(event) => set({ name: nameFromEditing(event.target.value) })}
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

          <Fieldset legend={e.tables} hint={e.tablesHint}>
            {tables.map((table, index) => (
              <TableFields
                key={index}
                index={index}
                table={table}
                onChange={(next) => setTable(index, next)}
              />
            ))}
            {tables.length < SPELL_LIMITS.tables && (
              <Button
                className="self-start"
                onClick={() => set({ tables: [...tables, { caption: '', rows: [EMPTY_ROW] }] })}
              >
                {e.addTable}
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
              onOverflow={side === 'back' ? setScrolls : undefined}
            />
            {scrolls && side === 'back' && (
              <p role="status" className="max-w-xs text-center text-sm text-dim">
                {t.card.scrolls}
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
      // Rows without a title or text go, and tables without rows.
      tables: (card.tables ?? [])
        .map((table) => ({
          ...table,
          rows: (table.rows ?? [])
            .filter((row) => row.title?.trim() || row.text?.trim())
            .map((row) => ({ ...row, chip: row.chip?.big.trim() ? row.chip : null })),
        }))
        .filter((table) => table.rows.length > 0),
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
      <ChipFields chip={effect.chip ?? null} onChange={(chip) => onChange({ chip })} />
    </div>
  )
}

/** A chip's value, the line under it and its damage kind, for effect and table rows. */
function ChipFields({
  chip,
  onChange,
}: {
  chip: SpellChip | null
  onChange: (chip: SpellChip) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <TextField
        label={e.chipBig}
        placeholder={e.chipBigPlaceholder}
        value={chip?.big ?? ''}
        maxLength={SPELL_LIMITS.chipBig}
        onChange={(event) => onChange({ ...(chip ?? {}), big: event.target.value })}
      />
      <TextField
        label={e.chipSmall}
        value={chip?.small ?? ''}
        maxLength={SPELL_LIMITS.chipSmall}
        disabled={!chip?.big}
        onChange={(event) => onChange({ big: chip?.big ?? '', ...chip, small: event.target.value })}
      />
      <SelectField
        label={e.chipKind}
        value={chip?.kind ?? ''}
        disabled={!chip?.big}
        onChange={(event) =>
          onChange({
            big: chip?.big ?? '',
            ...chip,
            kind: (event.target.value || null) as SpellChipKind | null,
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
  )
}

/** One table: the line above it and its rows; null from onChange removes it. */
function TableFields({
  index,
  table,
  onChange,
}: {
  index: number
  table: SpellTable
  onChange: (table: SpellTable | null) => void
}) {
  const rows = table.rows ?? []
  const setRow = (i: number, patch: Partial<SpellTableRow>) =>
    onChange({ ...table, rows: rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) })
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          className="min-w-48 flex-1"
          label={`${e.tableTitle(index)} · ${e.tableCaption}`}
          placeholder={e.tableCaptionPlaceholder}
          value={table.caption ?? ''}
          maxLength={SPELL_LIMITS.tableCaption}
          onChange={(event) => onChange({ ...table, caption: event.target.value })}
        />
        <Button variant="quiet" onClick={() => onChange(null)}>
          {e.removeTable}
        </Button>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              className="w-20"
              label={e.rowKey}
              placeholder={e.rowKeyPlaceholder}
              value={row.key ?? ''}
              maxLength={SPELL_LIMITS.tableKey}
              onChange={(event) => setRow(i, { key: event.target.value })}
            />
            <SelectField
              label={e.rowColor}
              value={row.color ?? ''}
              onChange={(event) =>
                setRow(i, { color: (event.target.value || null) as SpellRowColor | null })
              }
            >
              <option value="">{e.chipPlain}</option>
              {ROW_COLORS.map((color) => (
                <option key={color} value={color}>
                  {t.rowColors[color]}
                </option>
              ))}
            </SelectField>
            <TextField
              className="min-w-40 flex-1"
              label={e.rowTitle}
              value={row.title ?? ''}
              maxLength={SPELL_LIMITS.tableTitle}
              onChange={(event) => setRow(i, { title: event.target.value })}
            />
            <Button
              variant="quiet"
              aria-label={e.removeRow}
              onClick={() => onChange({ ...table, rows: rows.filter((_, j) => j !== i) })}
            >
              ✕
            </Button>
          </div>
          <TextArea
            label={e.rowText}
            hint={e.rowTextHint}
            rows={2}
            max={SPELL_LIMITS.tableText}
            value={row.text ?? ''}
            onChange={(text) => setRow(i, { text })}
          />
          <ChipFields chip={row.chip ?? null} onChange={(chip) => setRow(i, { chip })} />
        </div>
      ))}
      {rows.length < SPELL_LIMITS.tableRows && (
        <Button
          className="self-start"
          onClick={() => onChange({ ...table, rows: [...rows, EMPTY_ROW] })}
        >
          {e.addRow}
        </Button>
      )}
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
