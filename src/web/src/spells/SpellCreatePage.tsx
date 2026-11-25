// /zauber/neu: a new spell by hand, by name through the wiki, or from a book photo
// (knowledge/features/spell-cards.md, "Creating a spell"). All three end in the editor; nothing
// is saved before "Änderungen speichern". With ?kampagne=…&charakter=… the saved spell is
// added to that character and the page goes back there; with ?zauber=… the card is for that
// Handbook spell.
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { SpellDraft, SpellSummary } from '../api/types'
import { characterPath } from '../campaigns/paths'
import { useCharacters } from '../campaigns/queries'
import { BackLink } from '../components/sheet'
import { Button, ErrorAlert, PageTitle, TextField } from '../components/ui'
import { de } from '../text/de'
import { spellPaths } from './paths'
import { SpellCardView } from './SpellCard'
import { SpellEditor, type SpellEdit } from './SpellEditor'
import type { AddedSpellState } from './CharacterSpells'
import {
  blankCard,
  createVariant,
  importByName,
  importByPhoto,
  setCharacterSpell,
  shrinkPhoto,
  spellKeys,
  useSpellImportStatus,
  useSpellLibrary,
} from './queries'

const t = de.spells.create

type Tab = 'manual' | 'name' | 'photo'

/** A draft for the editor; `locked` when it is for a known spell (an import, ?zauber=…). */
interface Draft {
  edit: SpellEdit
  locked: boolean
}

export function SpellCreatePage() {
  const [params] = useSearchParams()
  const campaignId = params.get('kampagne')
  const characterId = params.get('charakter')
  const forCharacter = campaignId && characterId ? { campaignId, characterId } : null
  const spellId = params.get('zauber')
  const library = useSpellLibrary()
  const preset = spellId ? (library.data?.find((s) => s.id === spellId) ?? null) : null
  const [draft, setDraft] = useState<Draft | null>(null)

  if (draft) {
    return (
      <SaveDraft
        key={JSON.stringify(draft.edit)}
        draft={draft}
        forCharacter={forCharacter}
        onBack={() => setDraft(null)}
      />
    )
  }
  return <Choose key={preset?.id} forCharacter={forCharacter} preset={preset} onDraft={setDraft} />
}

function Choose({
  forCharacter,
  preset,
  onDraft,
}: {
  forCharacter: { campaignId: string; characterId: string } | null
  /** The spell from ?zauber=…, once the library has loaded. */
  preset: SpellSummary | null
  onDraft: (draft: Draft) => void
}) {
  const [tab, setTab] = useState<Tab>('name')
  const status = useSpellImportStatus()
  const importable = status.data?.available !== false
  return (
    <div className="flex flex-col pb-8">
      <BackLink
        to={
          forCharacter
            ? characterPath(forCharacter.campaignId, forCharacter.characterId)
            : spellPaths.library
        }
        label={t.back.replace('← ', '')}
      />
      <PageTitle>{preset ? `${t.title}: ${preset.nameEn}` : t.title}</PageTitle>
      {forCharacter && <ForCharacter {...forCharacter} />}
      <div role="tablist" aria-label={t.title} className="mt-2 flex flex-wrap gap-2">
        {(['name', 'photo', 'manual'] as const).map((key) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? 'primary' : 'secondary'}
            onClick={() => setTab(key)}
          >
            {t.tabs[key]}
          </Button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4 flex flex-col gap-3">
        {tab !== 'manual' && !importable && <ErrorAlert error={t.unavailable} />}
        {tab === 'manual' && (
          <>
            <p className="text-dim">{t.manualIntro}</p>
            <Button
              variant="primary"
              className="self-start"
              onClick={() =>
                onDraft({
                  edit: {
                    spellId: preset?.id ?? null,
                    nameEn: preset?.nameEn ?? '',
                    level: preset?.level ?? 1,
                    school: preset?.school ?? 'evocation',
                    card: blankCard(),
                    origin: 'manual',
                  },
                  locked: !!preset,
                })
              }
            >
              {de.spells.library.newSpell}
            </Button>
          </>
        )}
        {tab === 'name' && (
          <ByName disabled={!importable} initialName={preset?.nameEn ?? ''} onDraft={onDraft} />
        )}
        {tab === 'photo' && <ByPhoto disabled={!importable} onDraft={onDraft} />}
        {tab !== 'manual' && <p className="text-sm text-dim">{t.cost}</p>}
      </div>
    </div>
  )
}

function ForCharacter({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const characters = useCharacters(campaignId)
  const name = characters.data?.find((c) => c.id === characterId)?.name
  return name ? <p className="text-candle">{t.forCharacter(name)}</p> : null
}

const fromDraft = (draft: SpellDraft): Draft => ({
  edit: {
    spellId: draft.spellId,
    nameEn: draft.nameEn,
    level: draft.level,
    school: draft.school,
    card: draft.card,
    origin: draft.origin,
  },
  locked: true,
})

function ByName({
  disabled,
  initialName,
  onDraft,
}: {
  disabled: boolean
  initialName: string
  onDraft: (draft: Draft) => void
}) {
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [existing, setExisting] = useState<{ nameEn: string; spellId: string } | null>(null)

  const look = async (force: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const result = await importByName(name.trim(), force)
      if (result.draft) onDraft(fromDraft(result.draft))
      else if (result.variantCount > 0)
        setExisting({ nameEn: result.nameEn, spellId: result.spellId })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void look(false)
      }}
    >
      <p className="text-dim">{t.nameIntro}</p>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          className="min-w-56 flex-1"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          value={name}
          maxLength={60}
          onChange={(event) => {
            setName(event.target.value)
            setExisting(null)
          }}
        />
        <Button type="submit" variant="primary" busy={busy} disabled={disabled || !name.trim()}>
          {busy ? t.lookingUp : t.lookUp}
        </Button>
      </div>
      <ErrorAlert error={error} />
      {existing && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-candle/40 bg-candle/10 p-3"
        >
          <p className="text-parchment">{t.exists(existing.nameEn)}</p>
          <div className="flex flex-wrap gap-2">
            <Link
              to={spellPaths.spell(existing.spellId)}
              className="text-candle underline underline-offset-4"
            >
              {t.openExisting}
            </Link>
            <Button busy={busy} onClick={() => void look(true)}>
              {t.draftAnyway}
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}

function ByPhoto({ disabled, onDraft }: { disabled: boolean; onDraft: (draft: Draft) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [drafts, setDrafts] = useState<SpellDraft[] | null>(null)

  const read = async (file: File) => {
    setBusy(true)
    setError(null)
    setDrafts(null)
    try {
      const found = await importByPhoto(await shrinkPhoto(file))
      if (found.length === 1) onDraft(fromDraft(found[0]))
      else setDrafts(found)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-dim">{t.photoIntro}</p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void read(file)
        }}
      />
      <Button
        variant="primary"
        className="self-start"
        busy={busy}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {busy ? t.reading : t.takePhoto}
      </Button>
      <ErrorAlert error={error} />
      {drafts && (
        <div className="flex flex-col gap-3">
          <p className="text-parchment">{t.pickDraft}</p>
          <ul className="flex flex-wrap gap-4">
            {drafts.map((draft, index) => (
              <li key={index}>
                <button
                  type="button"
                  className="flex flex-col items-center gap-2"
                  onClick={() => onDraft(fromDraft(draft))}
                >
                  <SpellCardView
                    zoom={0.7}
                    spell={{
                      nameEn: draft.nameEn,
                      level: draft.level,
                      school: draft.school,
                      card: draft.card,
                    }}
                  />
                  <span className="text-parchment">{draft.card.name}</span>
                  {draft.variantCount > 0 && (
                    <span className="text-xs text-dim">{t.inLibrary}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SaveDraft({
  draft,
  forCharacter,
  onBack,
}: {
  draft: Draft
  forCharacter: { campaignId: string; characterId: string } | null
  onBack: () => void
}) {
  const navigate = useNavigate()
  const queries = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const origin = draft.edit.origin

  const save = async (edit: SpellEdit) => {
    setBusy(true)
    setError(null)
    try {
      if (!edit.spellId) return setBusy(false)
      const variant = await createVariant({ spellId: edit.spellId, card: edit.card, origin })
      await queries.invalidateQueries({ queryKey: spellKeys.all })
      if (forCharacter) {
        await setCharacterSpell(
          forCharacter.campaignId,
          forCharacter.characterId,
          variant.spellId,
          variant.id,
          false,
        )
        await queries.invalidateQueries({
          queryKey: spellKeys.character(forCharacter.campaignId, forCharacter.characterId),
        })
        const state: AddedSpellState = {
          addedSpell: { spellId: variant.spellId, name: variant.card.name },
        }
        navigate(characterPath(forCharacter.campaignId, forCharacter.characterId), {
          replace: true,
          state,
        })
      } else {
        navigate(spellPaths.spell(variant.spellId), { replace: true })
      }
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <PageTitle>{draft.edit.card.name || t.title}</PageTitle>
      <SpellEditor
        initial={draft.edit}
        factsLocked={draft.locked}
        intro={
          origin !== 'manual' ? (
            <p className="text-sm text-candle">
              {de.spells.editor.origin[origin]} · {de.spells.editor.draftHint}
            </p>
          ) : undefined
        }
        error={error}
        busy={busy}
        onSave={(edit) => void save(edit)}
        onCancel={onBack}
      />
    </div>
  )
}
