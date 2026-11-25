// /zauber: the site-wide spell library (knowledge/features/spell-cards.md, "Library"): the
// 2024 Player's Handbook's spells, filtered by name, level, school, class and subclass, and
// whether they have a card yet.
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import type { SpellSchool, SpellSummary } from '../api/types'
import { ButtonLink, LoadError, Loading, PageTitle, SelectField, TextField } from '../components/ui'
import { indexClasses, pickedSpellFilter, spellMatchesFilter, useClasses } from '../rules/classes'
import { de } from '../text/de'
import { spellPaths } from './paths'
import { SpellCardView } from './SpellCard'
import { matchesSpell, SCHOOLS } from './model'
import { useSpellLibrary } from './queries'

const t = de.spells

type Cards = 'with' | 'without' | 'all'

export function SpellLibraryPage() {
  const library = useSpellLibrary()
  const classList = useClasses()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<number | null>(null)
  const [school, setSchool] = useState<SpellSchool | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [subclassId, setSubclassId] = useState<string | null>(null)
  // As before the library held the Handbook: the spells someone wrote a card for.
  const [cards, setCards] = useState<Cards>('with')
  const deferred = useDeferredValue(query)

  if (library.isPending) return <Loading />
  if (library.isError)
    return <LoadError error={library.error} onRetry={() => void library.refetch()} />

  const index = classList.data ? indexClasses(classList.data) : undefined
  const picked = classId ? index?.classById.get(classId) : undefined
  const filter = classId ? pickedSpellFilter(classId, subclassId, index) : null
  const spells = library.data.filter(
    (s) =>
      matchesSpell(s, deferred) &&
      (level == null || s.level === level) &&
      (school == null || s.school === school) &&
      (filter == null || spellMatchesFilter(s.lists, filter)) &&
      (cards === 'all' || (cards === 'with') === s.variantCount > 0),
  )
  const levels = [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b)

  return (
    <div className="flex flex-col pb-8">
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle>{t.library.title}</PageTitle>
        <ButtonLink to={spellPaths.create()} variant="primary" className="mb-2 ml-auto">
          {t.library.newSpell}
        </ButtonLink>
      </div>
      <p className="text-dim">{t.library.intro}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
        <TextField
          label={t.library.search}
          type="search"
          placeholder={t.library.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label={de.spells.editor.level}
          value={level ?? ''}
          onChange={(event) =>
            setLevel(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">{t.library.allLevels}</option>
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {t.levelGroup(l)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={de.spells.editor.school}
          value={school ?? ''}
          onChange={(event) => setSchool((event.target.value || null) as SpellSchool | null)}
        >
          <option value="">{t.library.allSchools}</option>
          {SCHOOLS.map((s) => (
            <option key={s} value={s}>
              {t.schools[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t.library.classFilter}
          value={classId ?? ''}
          onChange={(event) => {
            setClassId(event.target.value || null)
            setSubclassId(null)
          }}
        >
          <option value="">{t.library.allClasses}</option>
          {classList.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameDe}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t.library.subclassFilter}
          value={subclassId ?? ''}
          disabled={!picked}
          onChange={(event) => setSubclassId(event.target.value || null)}
        >
          <option value="">{t.library.allSubclasses}</option>
          {picked?.subclasses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameDe}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t.library.cards}
          value={cards}
          onChange={(event) => setCards(event.target.value as Cards)}
        >
          <option value="with">{t.library.withCards}</option>
          <option value="without">{t.library.withoutCards}</option>
          <option value="all">{t.library.allCards}</option>
        </SelectField>
      </div>

      {library.data.length === 0 ? (
        <p className="mt-8 text-dim">{t.library.empty}</p>
      ) : spells.length === 0 ? (
        <p className="mt-8 text-dim">{t.library.noMatch}</p>
      ) : (
        levels.map((l) => (
          <section key={l} className="mt-8" aria-labelledby={`level-${l}`}>
            <h2
              id={`level-${l}`}
              className="font-display text-lg font-semibold tracking-[0.2em] text-candle uppercase"
            >
              {t.levelGroup(l)}
            </h2>
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
              {spells
                .filter((s) => s.level === l)
                .map((s) => (
                  <li key={s.id}>
                    <SpellTile spell={s} />
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/** A small card front with the names below, linking to the spell. */
export function SpellTile({ spell }: { spell: SpellSummary }) {
  return (
    <Link
      to={spellPaths.spell(spell.id)}
      className="group flex flex-col items-center gap-2 text-center"
    >
      <SpellCardView
        zoom={0.55}
        spell={{
          nameEn: spell.nameEn,
          level: spell.level,
          school: spell.school,
          artUrl: spell.artUrl,
          card: { name: spell.name, icon: spell.icon },
        }}
        className="transition-transform group-hover:-translate-y-1"
      />
      <span className="flex flex-col">
        <span className="font-semibold text-parchment group-hover:text-candle">{spell.name}</span>
        <span className="text-xs text-dim">
          {spell.nameEn} · {t.library.variants(spell.variantCount)}
        </span>
      </span>
    </Link>
  )
}
