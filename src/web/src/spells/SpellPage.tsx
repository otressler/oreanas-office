// /zauber/:spellId — a spell's variants side by side, each a card that turns over on a tap
// (knowledge/features/spell-cards.md, "Spell page"); and the editor pages for one variant:
// /zauber/varianten/:variantId/bearbeiten (its author) and …/eigene (a copy as a new variant).
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { SpellListLink, SpellVariant } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { BackLink } from '../components/sheet'
import {
  Button,
  ButtonLink,
  ErrorAlert,
  LoadError,
  Loading,
  Note,
  PageTitle,
} from '../components/ui'
import { indexClasses, useClasses } from '../rules/classes'
import { de } from '../text/de'
import { spellPaths } from './paths'
import { FlipCard } from './SpellCard'
import { SpellEditor, type SpellEdit } from './SpellEditor'
import {
  createVariant,
  deleteVariant,
  spellKeys,
  updateVariant,
  useSpell,
  useVariant,
} from './queries'

const t = de.spells.spell

export function SpellPage() {
  const { spellId = '' } = useParams()
  const spell = useSpell(spellId)
  const me = useCurrentUser()

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
        <PageTitle>{first?.card.name ?? data.nameDe ?? data.nameEn}</PageTitle>
        {data.inHandbook && data.variants.length > 0 && (
          <ButtonLink to={spellPaths.create(null, data.id)} className="mb-2 ml-auto">
            {t.writeCard}
          </ButtonLink>
        )}
      </div>
      <p className="text-dim">
        {data.nameEn} · {de.spells.schools[data.school]} · {de.spells.level(data.level)}
      </p>
      <SpellLists lists={data.lists} />
      {!data.inHandbook && (
        <div className="mt-4">
          <Note>{t.notInHandbook}</Note>
        </div>
      )}
      {data.variants.length === 0 ? (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-parchment">{t.noCards}</p>
          {data.inHandbook && (
            <ButtonLink to={spellPaths.create(null, data.id)} variant="primary">
              {t.writeCard}
            </ButtonLink>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-dim">{t.tapToFlip}</p>
      )}
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

/** The class lists a spell is on, and the subclasses that grant it from a class level. */
function SpellLists({ lists }: { lists: SpellListLink[] }) {
  const classes = useClasses()
  if (lists.length === 0) return null
  const index = classes.data ? indexClasses(classes.data) : undefined
  const className = (id: string) => index?.classById.get(id)?.nameDe ?? id
  const onList = lists.filter((l) => !l.subclassId).map((l) => className(l.classId))
  const granted = lists
    .filter((l) => l.subclassId)
    .map((l) =>
      de.spells.lists.granted(
        index?.subclassById.get(l.subclassId!)?.subclass.nameDe ?? l.subclassId!,
        className(l.classId),
        l.classLevel ?? 1,
      ),
    )
  const l = de.spells.lists
  return (
    <section aria-label={l.title} className="mt-3 flex flex-col gap-1 text-sm">
      <h2 className="font-display text-xs font-semibold tracking-[0.2em] text-candle uppercase">
        {l.title}
      </h2>
      {onList.length > 0 && (
        <p>
          <span className="text-dim">{l.classes}: </span>
          <span className="text-parchment">{onList.join(', ')}</span>
        </p>
      )}
      {granted.length > 0 && (
        <p>
          <span className="text-dim">{l.subclasses}: </span>
          <span className="text-parchment">{granted.join(', ')}</span>
        </p>
      )}
    </section>
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
    spellId: v.spellId,
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
      if (copy)
        await createVariant({
          spellId: v.spellId,
          card: edit.card,
          origin: 'manual',
          basedOnVariantId: v.id,
        })
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
