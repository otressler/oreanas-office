// The initiative setup screen (knowledge/features/initiative.md, "Setup"): the session DM
// types in the values the players rolled, and checks or changes the creatures' rolls,
// modifiers and advantage. The server rolled the creatures; "Neu würfeln" rolls again here.
// Saving sorts the list by value and replaces the saved one.
import { useEffect, useState } from 'react'
import type { BoardToken, InitiativeEntry, InitiativeRollResult } from '../api/types'
import { inputClass } from '../components/styles'
import { Badge, Button, ErrorAlert } from '../components/ui'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import {
  MODIFIER_MAX,
  MODIFIER_MIN,
  VALUE_MAX,
  VALUE_MIN,
  parseWhole,
  reroll,
  rollD20,
  setAdvantage,
  setModifier,
  setupEntries,
  setValue,
  sortedForSave,
  type D20,
} from './initiative'

const t = de.initiative

export function InitiativeSetup({
  tokens,
  saved,
  roll,
  onSave,
  onClose,
  d20 = rollD20,
}: {
  /** The tokens on the board, as the session DM sees them. */
  tokens: readonly BoardToken[]
  /** The saved list when editing; null for a first roll. */
  saved: readonly InitiativeEntry[] | null
  /** The server's fresh roll (RollInitiative). */
  roll: () => Promise<InitiativeRollResult>
  /** Saves the list; resolves to an error message, or null once it is saved. */
  onSave: (entries: InitiativeEntry[]) => Promise<string | null>
  onClose: () => void
  d20?: D20
}) {
  // Rolled only when a token on the board has no saved entry yet.
  const needsRoll =
    saved === null || tokens.some((token) => !saved.some((e) => e.tokenId === token.id))
  const [entries, setEntries] = useState<InitiativeEntry[] | null>(() =>
    needsRoll ? null : setupEntries(saved, [], tokens).entries,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!needsRoll) return
    let current = true
    roll().then(
      (result) => {
        if (!current) return
        if (result.entries) setEntries(setupEntries(saved, result.entries, tokens).entries)
        else setError(result.error ? de.errors[result.error] : t.rollFailed)
      },
      () => current && setError(t.needsConnection),
    )
    return () => {
      current = false
    }
    // One roll when the screen opens; later board changes don't roll again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byId = new Map(tokens.map((token) => [token.id, token]))
  const rows = (entries ?? []).flatMap((entry) => {
    const token = byId.get(entry.tokenId)
    return token ? [{ entry, token }] : []
  })
  const characters = rows.filter((row) => row.token.kind === 'character')
  const creatures = rows.filter((row) => row.token.kind === 'creature')

  const change = (tokenId: string, update: (entry: InitiativeEntry) => InitiativeEntry) =>
    setEntries(
      (current) =>
        current && current.map((entry) => (entry.tokenId === tokenId ? update(entry) : entry)),
    )

  async function save() {
    if (!entries) return
    setBusy(true)
    setError(null)
    const kept = setupEntries(saved, [], tokens).kept
    const failed = await onSave(sortedForSave([...entries, ...kept], saved ?? []))
    setBusy(false)
    if (failed) setError(failed)
    else onClose()
  }

  return (
    <Modal title={saved ? t.editTitle : t.setupTitle} onClose={onClose}>
      <p className="-mt-2 text-sm text-dim">{t.setupHint}</p>
      {!entries && !error && (
        <p role="status" className="text-sm text-parchment">
          {t.rolling}
        </p>
      )}
      {entries && characters.length > 0 && (
        <section aria-labelledby="initiative-characters" className="flex flex-col gap-2">
          <h3 id="initiative-characters" className="font-semibold text-parchment">
            {t.characters}
          </h3>
          <ul className="flex flex-col gap-2">
            {characters.map(({ entry, token }) => (
              <li
                key={token.id}
                data-testid={`setup-${token.id}`}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="min-w-0 flex-1 break-words text-parchment">{token.label}</span>
                <NumberField
                  label={t.valueOf(token.label)}
                  value={entry.value}
                  min={VALUE_MIN}
                  max={VALUE_MAX}
                  allowEmpty
                  onChange={(value) => change(token.id, (e) => ({ ...e, value }))}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {entries && creatures.length > 0 && (
        <section aria-labelledby="initiative-creatures" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="initiative-creatures" className="font-semibold text-parchment">
              {t.creatures}
            </h3>
            <Button
              variant="quiet"
              className="ml-auto"
              onClick={() =>
                setEntries(
                  (current) =>
                    current &&
                    current.map((entry) =>
                      byId.get(entry.tokenId)?.kind === 'creature' ? reroll(entry, d20) : entry,
                    ),
                )
              }
            >
              {t.rerollAll}
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {creatures.map(({ entry, token }) => (
              <CreatureRow
                key={token.id}
                entry={entry}
                token={token}
                onChange={(update) => change(token.id, update)}
                d20={d20}
              />
            ))}
          </ul>
        </section>
      )}
      {error && <ErrorAlert error={error} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" busy={busy} disabled={!entries} onClick={() => void save()}>
          {t.save}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {t.cancel}
        </Button>
      </div>
    </Modal>
  )
}

function CreatureRow({
  entry,
  token,
  onChange,
  d20,
}: {
  entry: InitiativeEntry
  token: BoardToken
  onChange: (update: (entry: InitiativeEntry) => InitiativeEntry) => void
  d20: D20
}) {
  return (
    <li
      data-testid={`setup-${token.id}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2"
    >
      <span className="flex min-w-0 flex-1 basis-32 flex-wrap items-center gap-2 text-parchment">
        <span className="break-words">{token.label}</span>
        {token.hidden && <Badge>{t.hidden}</Badge>}
      </span>
      <span className="flex items-center gap-1 text-sm text-dim">
        <span aria-hidden="true">{t.modifier}</span>
        <NumberField
          label={t.modifierOf(token.label)}
          value={entry.modifier}
          min={MODIFIER_MIN}
          max={MODIFIER_MAX}
          onChange={(value) => onChange((e) => setModifier(e, value ?? 0))}
        />
      </span>
      <label className="flex min-h-11 items-center gap-2 text-sm text-parchment">
        <input
          type="checkbox"
          checked={entry.advantage}
          aria-label={t.advantageOf(token.label)}
          onChange={(event) => onChange((e) => setAdvantage(e, event.target.checked, d20))}
        />
        {t.advantage}
      </label>
      <Rolls entry={entry} />
      <NumberField
        label={t.valueOf(token.label)}
        value={entry.value}
        min={VALUE_MIN}
        max={VALUE_MAX}
        onChange={(value) => onChange((e) => setValue(e, value))}
      />
      <Button
        variant="quiet"
        aria-label={t.rerollOf(token.label)}
        title={t.rerollOf(token.label)}
        onClick={() => onChange((e) => reroll(e, d20))}
      >
        <RerollIcon />
      </Button>
    </li>
  )
}

/** "W20: 14", with advantage "W20: 14 7" with the lower one struck through, or "eingetragen". */
function Rolls({ entry }: { entry: InitiativeEntry }) {
  if (entry.rolls.length === 0)
    return <span className="w-24 text-sm text-dim italic">{t.typed}</span>
  const best = Math.max(...entry.rolls)
  const dropped = entry.rolls.length > 1 ? entry.rolls.indexOf(Math.min(...entry.rolls)) : -1
  return (
    <span className="flex w-24 items-center gap-1 text-sm text-dim" data-testid="rolls">
      {t.d20}
      {entry.rolls.map((roll, index) => (
        <span
          key={index}
          className={
            index === dropped && roll !== best ? 'line-through opacity-60' : 'text-parchment'
          }
        >
          {roll}
        </span>
      ))}
    </span>
  )
}

/**
 * A whole number field: what is typed shows while it has focus, and every valid number goes
 * out at once. Empty means no value where `allowEmpty`; other text that isn't a number in
 * range is marked and not taken.
 */
function NumberField({
  label,
  value,
  min,
  max,
  allowEmpty = false,
  onChange,
}: {
  label: string
  value: number | null
  min: number
  max: number
  allowEmpty?: boolean
  onChange: (value: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? (value === null ? '' : String(value))
  const empty = text.trim() === ''
  const parsed = empty ? null : parseWhole(text, min, max)
  const invalid = empty ? !allowEmpty : parsed === null
  // The shared input class fills its container; the box keeps it narrow.
  return (
    <span className="block w-20 shrink-0">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={`${inputClass} text-right`}
        value={text}
        onFocus={() => setDraft(text)}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const trimmed = next.trim()
          if (trimmed === '') {
            if (allowEmpty) onChange(null)
            return
          }
          const number = parseWhole(next, min, max)
          if (number !== null) onChange(number)
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  )
}

/** Two arrows chasing each other: roll again. */
function RerollIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 text-candle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 21v-5h-5" />
    </svg>
  )
}
