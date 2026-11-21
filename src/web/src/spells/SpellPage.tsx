// /zauber/:spellId — a spell's variants side by side, each a card that turns over on a tap
// (knowledge/features/spell-cards.md, "Spell page"); and the editor pages for one variant:
// /zauber/varianten/:variantId/bearbeiten (its author) and …/eigene (a copy as a new variant).
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { SpellSchool, SpellVariant } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { BackLink } from '../components/sheet'
import {
  Button,
  ButtonLink,
  ErrorAlert,
  LoadError,
  Loading,
  PageTitle,
  SelectField,
  TextField,
} from '../components/ui'
import { de } from '../text/de'
import { spellPaths } from './paths'
import { FlipCard } from './SpellCard'
import { SCHOOLS } from './model'
import { SpellEditor, type SpellEdit } from './SpellEditor'
import {
  createVariant,
  deleteVariant,
  spellKeys,
  updateSpellFacts,
  updateVariant,
  useSpell,
  useVariant,
} from './queries'

const t = de.spells.spell

export function SpellPage() {
  const { spellId = '' } = useParams()
  const spell = useSpell(spellId)
  const me = useCurrentUser()
  const [editFacts, setEditFacts] = useState(false)

  if (spell.isPending) return <Loading />
  if (spell.isError) {
    return (
      <div className="flex flex-col">
        <BackLink to={spellPaths.library} label={de.spells.library.title} />
        <LoadError error={spell.error} onRetry={() => void spell.refetch()} />
      </div>
    )
  }
  const data = spell.data
  const first = data.variants[0]
  return (
    <div className="flex flex-col pb-8">
      <BackLink to={spellPaths.library} label={de.spells.library.title} />
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle>{first?.card.name ?? data.nameEn}</PageTitle>
        {data.canEditFacts && (
          <Button variant="quiet" className="mb-2" onClick={() => setEditFacts(!editFacts)}>
            {t.editFacts}
          </Button>
        )}
      </div>
      <p className="text-dim">
        {data.nameEn} · {de.spells.schools[data.school]} · {de.spells.level(data.level)}
      </p>
      {editFacts && (
        <FactsForm
          spellId={data.id}
          nameEn={data.nameEn}
          level={data.level}
          school={data.school}
          onDone={() => setEditFacts(false)}
        />
      )}
      <p className="mt-2 text-sm text-dim">{t.tapToFlip}</p>
      <ul className="mt-6 flex flex-wrap justify-center gap-8 sm:justify-start">
        {data.variants.map((variant) => (
          <li key={variant.id}>
            <VariantCard variant={variant} mine={variant.author.id === me.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function VariantCard({ variant, mine }: { variant: SpellVariant; mine: boolean }) {
  const queries = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const remove = async () => {
    if (!window.confirm(t.confirmDelete)) return
    try {
      await deleteVariant(variant.id)
      await queries.invalidateQueries({ queryKey: spellKeys.all })
      const rest = queries.getQueryData<{ variants: SpellVariant[] }>(
        spellKeys.spell(variant.spellId),
      )
      if (!rest || rest.variants.every((v) => v.id === variant.id)) navigate(spellPaths.library)
    } catch (err) {
      setError(err)
    }
  }
  return (
    <div className="flex w-[min(100%,21rem)] flex-col items-center gap-3">
      <FlipCard zoom={1.2} spell={{ ...variant, artUrl: variant.artUrl }} />
      <div className="flex flex-col items-center text-center">
        <span className="font-semibold text-parchment">
          {mine ? t.yours : t.by(variant.author.displayName)}
        </span>
        <span className="text-xs text-dim">
          {de.spells.editor.origin[variant.origin]} · {t.usedBy(variant.usedBy)}
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {variant.canEdit && (
          <>
            <ButtonLink to={spellPaths.edit(variant.id)}>{t.edit}</ButtonLink>
            <ButtonLink to={spellPaths.studio(variant.id)}>{t.studio}</ButtonLink>
          </>
        )}
        {!mine && (
          <ButtonLink to={spellPaths.ownVariant(variant.id)} title={t.ownVariantHint}>
            {t.ownVariant}
          </ButtonLink>
        )}
        {!variant.canEdit && (
          <ButtonLink to={spellPaths.studio(variant.id)} variant="quiet">
            {t.studio}
          </ButtonLink>
        )}
        {variant.canEdit && variant.usedBy === 0 && (
          <Button variant="quiet" onClick={() => void remove()}>
            {t.delete}
          </Button>
        )}
      </div>
      <ErrorAlert error={error} />
    </div>
  )
}

function FactsForm({
  spellId,
  nameEn,
  level,
  school,
  onDone,
}: {
  spellId: string
  nameEn: string
  level: number
  school: SpellSchool
  onDone: () => void
}) {
  const queries = useQueryClient()
  const [facts, setFacts] = useState({ nameEn, level, school })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const e = de.spells.editor
  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        try {
          await updateSpellFacts(spellId, facts.nameEn.trim(), facts.level, facts.school)
          await queries.invalidateQueries({ queryKey: spellKeys.all })
          onDone()
        } catch (err) {
          setError(err)
        } finally {
          setBusy(false)
        }
      }}
    >
      <TextField
        label={e.nameEn}
        value={facts.nameEn}
        maxLength={60}
        onChange={(event) => setFacts({ ...facts, nameEn: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label={e.level}
          value={facts.level}
          onChange={(event) => setFacts({ ...facts, level: Number(event.target.value) })}
        >
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {de.spells.level(l)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={e.school}
          value={facts.school}
          onChange={(event) => setFacts({ ...facts, school: event.target.value as SpellSchool })}
        >
          {SCHOOLS.map((s) => (
            <option key={s} value={s}>
              {de.spells.schools[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <ErrorAlert error={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={busy}>
          {t.saveFacts}
        </Button>
        <Button variant="quiet" onClick={onDone}>
          {de.common.cancel}
        </Button>
      </div>
    </form>
  )
}

/** …/bearbeiten edits the variant; …/eigene saves a copy as the user's own variant. */
export function SpellVariantEditPage({ copy = false }: { copy?: boolean }) {
  const { variantId = '' } = useParams()
  const variant = useVariant(variantId)
  const navigate = useNavigate()
  const queries = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (variant.isPending) return <Loading />
  if (variant.isError)
    return <LoadError error={variant.error} onRetry={() => void variant.refetch()} />
  const v = variant.data
  const initial: SpellEdit = {
    nameEn: v.nameEn,
    level: v.level,
    school: v.school,
    card: v.card,
    origin: copy ? 'manual' : v.origin,
  }
  const back = spellPaths.spell(v.spellId)

  const save = async (edit: SpellEdit) => {
    setBusy(true)
    setError(null)
    try {
      if (copy) await createVariant({ ...edit, origin: 'manual', basedOnVariantId: v.id })
      else await updateVariant(v.id, edit.card)
      await queries.invalidateQueries({ queryKey: spellKeys.all })
      navigate(back, { replace: true })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <BackLink to={back} label={v.card.name} />
      <PageTitle>{copy ? `${t.ownVariant}: ${v.card.name}` : v.card.name}</PageTitle>
      {!copy && !v.canEdit ? (
        <ErrorAlert error={de.errors.notSpellAuthor} />
      ) : (
        <SpellEditor
          initial={initial}
          factsLocked
          intro={copy ? <p className="text-sm text-dim">{t.ownVariantHint}</p> : undefined}
          error={error}
          busy={busy}
          onSave={(edit) => void save(edit)}
          onCancel={() => navigate(back)}
        />
      )}
    </div>
  )
}
