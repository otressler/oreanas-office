// The "Zauber" section of the character page (knowledge/features/spell-cards.md, "A
// character's spells"): the spells by level as small card fronts with "Vorbereitet", and for
// whoever may edit the character adding, switching the variant and removing. Adding first
// shows the spells of the character's classes; the others stay a click away. A spell added
// here or on the creation page then offers the statuses the character's list is missing.
import { useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { CharacterClassEntry, CharacterSpell, SpellSummary, SpellVariant } from '../api/types'
import { SectionTitle } from '../components/sheet'
import { Button, ButtonLink, ErrorAlert, LoadError, Loading, TextField } from '../components/ui'
import {
  characterSpellFilter,
  indexClasses,
  spellMatchesFilter,
  useClasses,
} from '../rules/classes'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import { spellPaths } from './paths'
import { FlipCard, SpellCardView } from './SpellCard'
import { matchesSpell } from './model'
import { StatusOffersDialog } from './StatusOffers'
import { loadOffers, type PendingOffers } from './statuses'
import {
  removeCharacterSpell,
  setCharacterSpell,
  spellKeys,
  useCharacterSpells,
  useSpell,
  useSpellLibrary,
} from './queries'

const t = de.spells.character

/** The creation page's way back: the spell it just added, so its statuses get offered. */
export interface AddedSpellState {
  addedSpell?: { spellId: string; name: string }
}

export function CharacterSpells({
  campaignId,
  characterId,
  characterName,
  canEdit,
  classes,
}: {
  campaignId: string
  characterId: string
  characterName?: string
  canEdit: boolean
  /** The character's classes, for the add dialog's default filter. */
  classes: CharacterClassEntry[]
}) {
  const spells = useCharacterSpells(campaignId, characterId)
  const queries = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<CharacterSpell | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [offering, setOffering] = useState<PendingOffers | null>(null)

  // Back from "Neuen Zauber anlegen": offer once, then forget it, so a reload doesn't ask again.
  // Kept from the first render: clearing the state below mustn't cancel the offers.
  const location = useLocation()
  const navigate = useNavigate()
  const [added] = useState(() => (location.state as AddedSpellState | null)?.addedSpell)
  useEffect(() => {
    if (!added || !canEdit) return
    navigate(location.pathname + location.search, { replace: true, state: null })
    void loadOffers(campaignId, characterId, added.spellId, added.name).then(setOffering)
    // Once per arrival; the path stays the same while this section shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [added])

  const refresh = () => {
    void queries.invalidateQueries({ queryKey: spellKeys.character(campaignId, characterId) })
    void queries.invalidateQueries({ queryKey: spellKeys.campaign(campaignId) })
    void queries.invalidateQueries({ queryKey: spellKeys.all })
  }
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      refresh()
    } catch (err) {
      setError(err)
    }
  }

  const list = spells.data ?? []
  const levels = [...new Set(list.map((s) => s.variant.level))].sort((a, b) => a - b)
  const prepared = list.filter((s) => s.prepared).length

  return (
    <section aria-labelledby="spells" className="mt-10 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SectionTitle id="spells">{t.title}</SectionTitle>
        {list.length > 0 && (
          <span className="text-sm text-dim">{t.preparedCount(prepared, list.length)}</span>
        )}
        {canEdit && (
          <span className="ml-auto flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t.add}
            </Button>
            <ButtonLink to={spellPaths.create({ campaignId, characterId })}>{t.create}</ButtonLink>
          </span>
        )}
      </div>
      <ErrorAlert error={error} />
      {spells.isPending ? (
        <Loading />
      ) : spells.isError ? (
        <LoadError error={spells.error} onRetry={() => void spells.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-dim">{canEdit ? t.emptyEditable : t.empty}</p>
      ) : (
        levels.map((level) => (
          <div key={level} className="flex flex-col gap-2">
            <h3 className="font-display text-sm font-semibold tracking-[0.2em] text-candle uppercase">
              {de.spells.levelGroup(level)}
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
              {list
                .filter((s) => s.variant.level === level)
                .map((entry) => (
                  <li
                    key={entry.spellId}
                    className="flex flex-col items-center gap-1.5 text-center"
                  >
                    <button
                      type="button"
                      onClick={() => setOpen(entry)}
                      className={`transition-opacity ${entry.prepared ? '' : 'opacity-60 hover:opacity-90'}`}
                      aria-label={entry.variant.card.name}
                    >
                      <SpellCardView zoom={0.48} spell={{ ...entry.variant }} />
                    </button>
                    <span className="text-sm font-semibold text-parchment">
                      {entry.variant.card.name}
                    </span>
                    {canEdit ? (
                      <label className="flex min-h-9 items-center gap-2 text-sm text-parchment">
                        <input
                          type="checkbox"
                          className="size-5 accent-candle"
                          checked={entry.prepared}
                          onChange={(event) =>
                            void run(() =>
                              setCharacterSpell(
                                campaignId,
                                characterId,
                                entry.spellId,
                                entry.variant.id,
                                event.target.checked,
                              ),
                            )
                          }
                        />
                        {t.prepared}
                      </label>
                    ) : (
                      entry.prepared && <span className="text-xs text-candle">{t.prepared}</span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
      {open && (
        <SpellDialog
          entry={open}
          canEdit={canEdit}
          onSwitch={(variant) =>
            run(async () => {
              await setCharacterSpell(campaignId, characterId, open.spellId, variant.id)
              setOpen({ ...open, variant })
            })
          }
          onRemove={() =>
            run(async () => {
              await removeCharacterSpell(campaignId, characterId, open.spellId)
              setOpen(null)
            })
          }
          onClose={() => setOpen(null)}
        />
      )}
      {adding && (
        <AddSpellDialog
          has={new Set(list.map((s) => s.spellId))}
          classes={classes}
          forCharacter={{ campaignId, characterId }}
          onAdd={(variant) =>
            run(async () => {
              await setCharacterSpell(campaignId, characterId, variant.spellId, variant.id, false)
              setAdding(false)
              setOffering(
                await loadOffers(campaignId, characterId, variant.spellId, variant.card.name),
              )
            })
          }
          createPath={spellPaths.create({ campaignId, characterId })}
          onClose={() => setAdding(false)}
        />
      )}
      {offering && (
        <StatusOffersDialog
          campaignId={campaignId}
          characterId={characterId}
          characterName={characterName}
          pending={offering}
          onClose={() => setOffering(null)}
        />
      )}
    </section>
  )
}

/** One spell large, to turn over; for editors also another variant and removing. */
function SpellDialog({
  entry,
  canEdit,
  onSwitch,
  onRemove,
  onClose,
}: {
  entry: CharacterSpell
  canEdit: boolean
  onSwitch: (variant: SpellVariant) => Promise<void>
  onRemove: () => Promise<void>
  onClose: () => void
}) {
  const [switching, setSwitching] = useState(false)
  return (
    <Modal title={entry.variant.card.name} onClose={onClose} size="wide">
      <p className="-mt-3 text-sm text-dim">{de.spells.spell.tapToFlip}</p>
      <div className="flex justify-center">
        <FlipCard zoom={1.25} spell={entry.variant} />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink to={spellPaths.spell(entry.variant.spellId)} variant="quiet">
          {de.spells.spell.back.replace('← ', '')}
        </ButtonLink>
        {canEdit && (
          <>
            <Button onClick={() => setSwitching(!switching)} aria-expanded={switching}>
              {de.spells.character.switchVariant}
            </Button>
            {/* No question first: a removed spell is quickly added again. */}
            <Button variant="quiet" onClick={() => void onRemove()}>
              {t.remove}
            </Button>
          </>
        )}
      </div>
      {switching && (
        <VariantPicker
          spellId={entry.spellId}
          current={entry.variant.id}
          onPick={(v) => void onSwitch(v)}
        />
      )}
    </Modal>
  )
}

function VariantPicker({
  spellId,
  current,
  onPick,
}: {
  spellId: string
  current?: string
  onPick: (variant: SpellVariant) => void
}) {
  const spell = useSpell(spellId)
  if (spell.isPending) return <Loading />
  if (spell.isError) return <LoadError error={spell.error} onRetry={() => void spell.refetch()} />
  return (
    <ul className="flex flex-wrap justify-center gap-4">
      {spell.data.variants.map((variant) => (
        <li key={variant.id}>
          <button
            type="button"
            aria-pressed={variant.id === current}
            onClick={() => onPick(variant)}
            className={`flex flex-col items-center gap-1 rounded-xl p-1 ${variant.id === current ? 'ring-2 ring-candle' : ''}`}
          >
            <SpellCardView zoom={0.6} side="back" spell={variant} />
            <span className="text-sm text-parchment">
              {de.spells.spell.by(variant.author.displayName)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AddSpellDialog({
  has,
  classes,
  forCharacter,
  onAdd,
  createPath,
  onClose,
}: {
  has: ReadonlySet<string>
  classes: CharacterClassEntry[]
  forCharacter: { campaignId: string; characterId: string }
  onAdd: (variant: SpellVariant) => Promise<void>
  createPath: string
  onClose: () => void
}) {
  const library = useSpellLibrary()
  const classList = useClasses()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [picking, setPicking] = useState<SpellSummary | null>(null)
  // The character's class lists by default; players may still take any spell.
  const [onlyMine, setOnlyMine] = useState(classes.length > 0)
  const index = classList.data ? indexClasses(classList.data) : undefined
  const filter = characterSpellFilter(classes, index)
  const classNames = classes.map((c) => index?.classById.get(c.classId)?.nameDe ?? c.classId)
  const shown = (library.data ?? []).filter(
    (spell) =>
      matchesSpell(spell, deferred) && (!onlyMine || spellMatchesFilter(spell.lists, filter)),
  )

  return (
    <Modal title={t.pickTitle} onClose={onClose} size="wide">
      {picking ? (
        <div className="flex flex-col gap-3">
          <p className="text-parchment">{t.pickVariant(picking.name)}</p>
          <VariantPicker spellId={picking.id} onPick={(variant) => void onAdd(variant)} />
          <Button variant="quiet" className="self-start" onClick={() => setPicking(null)}>
            {t.back}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <TextField
            label={de.spells.library.search}
            type="search"
            autoFocus
            placeholder={de.spells.library.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {classes.length > 0 ? (
            <label className="flex min-h-9 items-center gap-2 text-sm text-parchment">
              <input
                type="checkbox"
                className="size-5 accent-candle"
                checked={onlyMine}
                onChange={(event) => setOnlyMine(event.target.checked)}
              />
              {t.onlyMyClasses(classNames.join(', '))}
            </label>
          ) : (
            <p className="text-sm text-dim">{t.noClassHint}</p>
          )}
          {library.isPending ? (
            <Loading />
          ) : library.isError ? (
            <LoadError error={library.error} onRetry={() => void library.refetch()} />
          ) : shown.length === 0 ? (
            <p className="text-dim">{onlyMine ? t.noMatch : de.spells.library.noMatch}</p>
          ) : (
            <ul className="flex max-h-[55dvh] flex-col divide-y divide-line overflow-y-auto">
              {shown.map((spell) => {
                const label = (
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-parchment">{spell.name}</span>
                    <span className="block text-xs text-dim">
                      {spell.nameEn} · {de.spells.level(spell.level)} ·{' '}
                      {de.spells.schools[spell.school]}
                    </span>
                  </span>
                )
                const row =
                  'flex min-h-12 w-full items-center gap-3 px-2 py-2 text-left hover:bg-line/30'
                return (
                  <li key={spell.id}>
                    {spell.variantCount === 0 && !has.has(spell.id) ? (
                      // Without a card there's nothing to add yet: write the first one.
                      <Link to={spellPaths.create(forCharacter, spell.id)} className={row}>
                        {label}
                        <span className="text-xs text-candle">{t.noCardYet}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled={has.has(spell.id)}
                        onClick={() => setPicking(spell)}
                        className={`${row} disabled:opacity-50`}
                      >
                        {label}
                        <span className="text-xs text-dim">
                          {has.has(spell.id)
                            ? t.alreadyHas
                            : de.spells.library.variants(spell.variantCount)}
                        </span>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-sm text-dim">
            {t.notFoundHint}{' '}
            <ButtonLink to={createPath} variant="quiet">
              {t.create}
            </ButtonLink>
          </p>
        </div>
      )}
    </Modal>
  )
}
