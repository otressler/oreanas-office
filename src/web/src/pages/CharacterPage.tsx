import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { errorMessage } from '../api/errors'
import type { Character, CharacterRequest, CreatureSize } from '../api/types'
import { useCurrentUser } from '../auth/auth'
import { defaultRingColor, parseHexColor, ringColor } from '../board/palette'
import { ColorField, OwnerField, SIZES, type OwnerChoice } from '../campaigns/CharacterFields'
import { characterPath } from '../campaigns/paths'
import { useCampaign, useCharacters } from '../campaigns/queries'
import { useSaveCharacter } from '../campaigns/useSaveCharacter'
import { PencilIcon } from '../components/icons'
import { Markdown } from '../components/Markdown'
import { Kicker, Rule, SectionHeading } from '../components/ornaments'
import { inputClass } from '../components/styles'
import {
  Button,
  ErrorAlert,
  LoadError,
  Loading,
  PageTitle,
  SelectField,
  TextField,
} from '../components/ui'
import { limits } from '../lib/limits'
import { StatusListEditor } from '../statuses/StatusListEditor'
import { de } from '../text/de'
import { TokenImageGallery, type Prepared } from '../tokenImages/TokenImageGallery'
import { TokenPicture } from '../tokenImages/TokenPicture'

const t = de.characters
const p = t.page

/** What the page lets its editor change, held while the pencil is open. */
interface Draft {
  name: string
  size: CreatureSize
  characterClass: string
  species: string
  age: string
  owner: string
  color: string
  tagline: string
  appearance: string
  background: string
  personality: string
  bonds: string
}

type TextKey = 'appearance' | 'background' | 'personality' | 'bonds'

/** The texts about a character in reading order, with their limits. */
const SECTIONS: { key: TextKey; max: number; rows: number }[] = [
  { key: 'appearance', max: limits.characterAppearance, rows: 3 },
  { key: 'background', max: limits.characterBackground, rows: 5 },
  { key: 'personality', max: limits.characterPersonality, rows: 3 },
  { key: 'bonds', max: limits.characterBonds, rows: 4 },
]

const draftOf = (character: Character): Draft => ({
  name: character.name,
  size: character.size,
  characterClass: character.characterClass,
  species: character.species,
  age: character.age,
  owner: character.ownerUserId,
  color: character.color ?? '',
  tagline: character.tagline,
  appearance: character.appearance,
  background: character.background,
  personality: character.personality,
  bonds: character.bonds,
})

/**
 * /kampagnen/:campaignId/charaktere/:characterId — one character for every member to read.
 * Whoever may edit it (its player, `dm` members) opens the pencil and the page itself turns
 * into the editor: the name, the texts and the portraits change in place, with one bar to
 * save or drop it all (knowledge/features/character-page.md).
 */
export function CharacterPage({ isNew = false }: { isNew?: boolean }) {
  const { campaignId = '', characterId = '' } = useParams()
  const me = useCurrentUser()
  const campaign = useCampaign(campaignId)
  const characters = useCharacters(campaignId)

  if (campaign.isPending || characters.isPending) return <Loading />
  if (campaign.isError) {
    return <LoadError error={campaign.error} onRetry={() => void campaign.refetch()} />
  }
  if (characters.isError) {
    return <LoadError error={characters.error} onRetry={() => void characters.refetch()} />
  }
  const character = isNew
    ? blankCharacter(me, characters.data.length)
    : characters.data.find((c) => c.id === characterId)
  if (!character) {
    return (
      <div className="flex flex-col pb-8">
        <BackLink to={`/kampagnen/${campaignId}`} label={p.back} />
        <PageTitle>{p.unknownTitle}</PageTitle>
        <p className="text-dim">{p.unknownBody}</p>
      </div>
    )
  }

  const owners: OwnerChoice | undefined =
    campaign.data.myRole === 'dm' ? { members: campaign.data.members, me: me.id } : undefined
  return (
    <CharacterView
      key={character.id}
      campaignId={campaignId}
      campaignName={campaign.data.name}
      character={character}
      mine={character.ownerUserId === me.id}
      owners={owners}
      isNew={isNew}
    />
  )
}

/** What "Neuer Charakter" edits until it is saved: nothing is created before that. */
function blankCharacter(me: { id: string; displayName: string }, colorIndex: number): Character {
  return {
    id: '',
    ownerUserId: me.id,
    ownerDisplayName: me.displayName,
    name: '',
    size: 'medium',
    canEdit: true,
    colorIndex,
    tagline: '',
    characterClass: '',
    species: '',
    age: '',
    appearance: '',
    background: '',
    personality: '',
    bonds: '',
    portraitUrl: null,
    color: null,
  }
}

function CharacterView({
  campaignId,
  campaignName,
  character,
  mine,
  owners,
  isNew,
}: {
  campaignId: string
  campaignName: string
  character: Character
  mine: boolean
  owners?: OwnerChoice
  /** A character that doesn't exist yet: the page opens as the editor, and saving creates it. */
  isNew: boolean
}) {
  // Null while reading.
  const [draft, setDraft] = useState<Draft | null>(isNew ? draftOf(character) : null)
  const [colorTouched, setColorTouched] = useState(false)
  const [nameMissing, setNameMissing] = useState(false)
  const navigate = useNavigate()
  // Set just before leaving on purpose (saved, or cancelled), so the leave warning stays quiet.
  const leaving = useRef(false)
  const save = useSaveCharacter(campaignId, isNew ? undefined : character.id)
  const editing = draft !== null
  const ring = ringColor({ kind: 'character', ...character })

  function change(fields: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...fields })
  }

  const pickedColor = draft ? parseHexColor(draft.color) : null
  const colorInvalid = draft !== null && draft.color.trim() !== '' && pickedColor === null

  function request(d: Draft): CharacterRequest {
    return {
      name: d.name.trim(),
      size: d.size,
      characterClass: d.characterClass.trim(),
      species: d.species.trim(),
      age: d.age.trim(),
      tagline: d.tagline.trim(),
      appearance: d.appearance.trim(),
      background: d.background.trim(),
      personality: d.personality.trim(),
      bonds: d.bonds.trim(),
      color: parseHexColor(d.color),
      // Without the field the server keeps the owner.
      ...(owners && { ownerUserId: d.owner }),
    }
  }

  function submit() {
    if (!draft) return
    if (!draft.name.trim()) {
      setNameMissing(true)
      return
    }
    if (colorInvalid) {
      setColorTouched(true)
      return
    }
    save.mutate(request(draft), {
      onSuccess: (saved) => {
        if (!isNew) return setDraft(null)
        leaving.current = true
        void navigate(characterPath(campaignId, saved.id), { replace: true })
      },
    })
  }

  function cancel() {
    if (!isNew) return setDraft(null)
    leaving.current = true
    void navigate(`/kampagnen/${campaignId}`)
  }

  function open() {
    save.reset()
    setColorTouched(false)
    setDraft(draftOf(character))
  }

  /** Before a portrait job: saves changed fields first, since the server paints from its copy. */
  async function prepare(progress: (text: string) => void): Promise<Prepared> {
    if (!draft) return { error: de.requestErrors.unknown }
    const body = request(draft)
    const changed =
      body.name !== character.name ||
      body.tagline !== character.tagline ||
      body.size !== character.size ||
      body.characterClass !== character.characterClass ||
      body.species !== character.species ||
      body.age !== character.age ||
      body.appearance !== character.appearance ||
      body.background !== character.background ||
      body.personality !== character.personality ||
      body.bonds !== character.bonds ||
      body.color !== character.color ||
      (body.ownerUserId ?? character.ownerUserId) !== character.ownerUserId
    if (changed) {
      if (!body.name) return { error: de.errors.nameInvalid }
      if (colorInvalid) return { error: de.errors.colorInvalid }
      progress(t.portrait.saving)
      try {
        await save.mutateAsync(body)
      } catch (error) {
        return { error: errorMessage(error) }
      }
    }
    return { body: {} }
  }

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(draftOf(character))
  // Leaving with typed-in changes asks first: closing the tab, and moving to another page.
  const blocker = useBlocker(() => dirty && !save.isPending && !leaving.current)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(p.leave)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const portraitTools = draft && !isNew && (
    <section aria-label={t.portrait.title} className="flex flex-col gap-2">
      <TokenImageGallery
        campaignId={campaignId}
        owner={{ type: 'character', id: character.id }}
        name={character.name}
        ring={ringColor({
          kind: 'character',
          colorIndex: character.colorIndex,
          color: pickedColor,
        })}
        generateLabel={t.portrait.generate}
        regenerateLabel={t.portrait.regenerate}
        generateHint={draft.appearance.trim() ? null : t.portrait.needsAppearance}
        prepare={prepare}
        uploads
        restyles
        layout="sidebar"
      />
      <p className="text-sm text-dim">{p.portraitHint}</p>
    </section>
  )

  return (
    <div className="flex flex-col pb-12" style={{ '--ring': ring } as CSSProperties}>
      <BackLink to={`/kampagnen/${campaignId}`} label={campaignName} />
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[18rem_1fr] lg:gap-12">
        <aside className="flex flex-col gap-4">
          <Portrait character={character} ring={ring} />
          {portraitTools}
          {isNew && <p className="text-sm text-dim">{p.portraitAfterSave}</p>}
        </aside>

        <header className="max-w-3xl min-w-0">
          {draft ? (
            <div className="flex flex-col gap-4">
              {isNew && <Kicker>{t.add}</Kicker>}
              <TextField
                label={t.name}
                required
                maxLength={limits.characterName}
                value={draft.name}
                invalid={nameMissing}
                className="[&_input]:font-display [&_input]:text-2xl [&_input]:font-semibold"
                onChange={(event) => {
                  setNameMissing(false)
                  change({ name: event.target.value })
                }}
              />
              <TextArea
                label={p.tagline.label}
                hint={p.tagline.hint}
                rows={2}
                max={limits.characterTagline}
                value={draft.tagline}
                onChange={(tagline) => change({ tagline })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={t.characterClass}
                  maxLength={limits.characterFact}
                  value={draft.characterClass}
                  onChange={(event) => change({ characterClass: event.target.value })}
                />
                <TextField
                  label={t.species}
                  maxLength={limits.characterFact}
                  value={draft.species}
                  onChange={(event) => change({ species: event.target.value })}
                />
                <TextField
                  label={t.age}
                  maxLength={limits.characterFact}
                  value={draft.age}
                  onChange={(event) => change({ age: event.target.value })}
                />
                <SelectField
                  label={t.size}
                  value={draft.size}
                  onChange={(event) => change({ size: event.target.value as CreatureSize })}
                >
                  {SIZES.map((value) => (
                    <option key={value} value={value}>
                      {de.sizes[value]}
                    </option>
                  ))}
                </SelectField>
                {owners && (
                  <OwnerField
                    members={owners.members}
                    value={draft.owner}
                    onChange={(owner) => change({ owner })}
                  />
                )}
              </div>
              <ColorField
                value={draft.color}
                fallback={defaultRingColor(character.colorIndex)}
                invalid={colorTouched && colorInvalid}
                onChange={(color) => change({ color })}
                onBlur={() => setColorTouched(true)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Kicker>{mine ? t.mine : t.owner(character.ownerDisplayName)}</Kicker>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <SectionHeading level={1}>{character.name}</SectionHeading>
                {character.canEdit && (
                  <Button aria-label={p.edit(character.name)} onClick={open} className="gap-2">
                    <PencilIcon className="size-4" />
                    {p.editButton}
                  </Button>
                )}
              </div>
              {character.tagline && (
                <p className="max-w-2xl text-lg text-parchment/85 italic">{character.tagline}</p>
              )}
              <Facts
                facts={[
                  [t.characterClass, character.characterClass],
                  [t.species, character.species],
                  [t.age, character.age],
                  [t.size, de.sizes[character.size]],
                ]}
              />
            </div>
          )}
        </header>
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-3xl flex-col gap-10">
        {SECTIONS.map(({ key, max, rows }) => (
          <Story
            key={key}
            title={p.sections[key].title}
            hint={p.sections[key].hint}
            value={draft ? draft[key] : character[key]}
            max={max}
            rows={rows}
            editing={editing}
            onChange={(value) => change({ [key]: value } as Partial<Draft>)}
          />
        ))}

        {character.canEdit && !editing && (
          <StatusListSection campaignId={campaignId} character={character} />
        )}
      </div>

      {draft && (
        <div
          role="group"
          aria-label={isNew ? t.add : p.edit(character.name)}
          className="sticky bottom-0 z-10 -mx-4 mt-10 flex flex-col gap-2 border-t border-candle/25 bg-table/90 px-4 py-3 backdrop-blur-sm"
        >
          <ErrorAlert error={nameMissing ? de.errors.nameInvalid : save.error} />
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <p role="status" className="mr-auto text-sm text-candle">
                {p.unsaved}
              </p>
            )}
            <Button variant="quiet" className="ml-auto" onClick={cancel}>
              {de.common.cancel}
            </Button>
            <Button variant="primary" busy={save.isPending} onClick={submit}>
              {p.saveChanges}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The short facts under the name: label over value, those left empty are skipped. */
function Facts({ facts }: { facts: [label: string, value: string][] }) {
  return (
    <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
      {facts
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="font-display text-xs font-semibold tracking-[0.2em] text-candle uppercase">
              {label}
            </dt>
            <dd className="text-lg text-parchment">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="pt-4 text-sm text-candle underline-offset-4 hover:underline">
      <span aria-hidden="true">← </span>
      {label}
    </Link>
  )
}

function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div>
      <h2 id={id} className="font-display text-2xl font-semibold text-parchment">
        {children}
      </h2>
      <Rule className="mt-2 w-32" />
    </div>
  )
}

/** The character's status list, folded until asked for: a combat setting, not part of the story. */
function StatusListSection({
  campaignId,
  character,
}: {
  campaignId: string
  character: Character
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const l = de.statuses.list
  return (
    <section aria-label={l.show(character.name)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle>{l.title}</SectionTitle>
        <Button
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? l.hide : l.showDm}
        </Button>
      </div>
      <p className="text-sm text-dim">{l.help}</p>
      {open && (
        <div id={id}>
          <StatusListEditor
            campaignId={campaignId}
            owner={{ kind: 'character', characterId: character.id }}
          />
        </div>
      )}
    </section>
  )
}

/** A multi-line field that grows with its text, with its hint and a counter on the right. */
function TextArea({
  label,
  hint,
  rows,
  max,
  value,
  onChange,
  id: given,
}: {
  label: string
  hint: ReactNode
  rows: number
  max: number
  value: string
  onChange: (value: string) => void
  id?: string
}) {
  const generated = useId()
  const id = given ?? generated
  const length = Array.from(value).length
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-dim">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={max}
        aria-describedby={`${id}-hint`}
        className={`${inputClass} w-full field-sizing-content resize-none`}
        onChange={(event) => onChange(event.target.value)}
      />
      <div id={`${id}-hint`} className="flex flex-wrap justify-between gap-x-4 text-sm text-dim">
        <span>{hint}</span>
        <span className={`tabular-nums ${length >= max * 0.9 ? 'text-candle' : 'text-dim/70'}`}>
          ({length}/{max})
        </span>
      </div>
    </div>
  )
}

/** One text about the character: read as formatted text, or a box while editing. */
function Story({
  title,
  hint,
  value,
  max,
  rows,
  editing,
  onChange,
}: {
  title: string
  hint: string
  value: string
  max: number
  rows: number
  editing: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <section aria-labelledby={editing ? undefined : `${id}-title`} className="flex flex-col gap-3">
      {editing ? (
        <TextArea
          id={id}
          label={title}
          hint={`${hint} ${p.markdownHint}`}
          rows={rows}
          max={max}
          value={value}
          onChange={onChange}
        />
      ) : (
        <>
          <SectionTitle id={`${id}-title`}>{title}</SectionTitle>
          {value ? <Markdown>{value}</Markdown> : <p className="text-dim">{p.empty}</p>}
        </>
      )}
    </section>
  )
}

/** The portrait as painted in the ring's light; the token's letter without one. */
function Portrait({ character, ring }: { character: Character; ring: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const url =
    character.portraitUrl && failed !== character.portraitUrl ? character.portraitUrl : null
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-sm border border-candle/25 bg-panel shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_srgb,var(--ring)_40%,transparent),transparent_80%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[var(--ring)]" />
      {url ? (
        <img
          src={url}
          alt={t.portraitAlt(character.name)}
          decoding="async"
          onError={() => setFailed(url)}
          className="absolute inset-0 size-full object-contain p-3 drop-shadow-[0_12px_24px_rgb(0_0_0/0.85)]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <TokenPicture
            url={null}
            label={character.name}
            ring={ring}
            alt=""
            className="size-28 text-5xl"
          />
        </div>
      )}
    </div>
  )
}
