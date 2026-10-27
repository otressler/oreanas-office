// /kampagnen/:campaignId/bestiarium/:typeId — one creature type, read like a character's page
// and edited in place (knowledge/features/creature-page.md). It works offline from the
// campaign's copy and writes to this browser (knowledge/domain/creature-type.md); the icon
// tools need a connection and a type the server knows (knowledge/features/token-icons.md).
import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { CreatureSize, InitiativeRollMode } from '../api/types'
import { footprint } from '../board/geometry'
import { CREATURE_RING } from '../board/palette'
import { PencilIcon } from '../components/icons'
import { Kicker, SectionHeading } from '../components/ornaments'
import { BackLink, EditBar, Facts, Portrait, Story } from '../components/sheet'
import { useLeaveWarning } from '../components/useLeaveWarning'
import { Button, Loading, PageTitle, SelectField, TextField } from '../components/ui'
import { MODIFIER_MAX, MODIFIER_MIN, ROLL_MODES, formatModifier } from '../initiative/initiative'
import { useLocalUser } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { de } from '../text/de'
import { useCreatureIcons } from '../tokenImages/queries'
import { BestiaryGate } from './BestiaryGate'
import { CreatureIconSection } from './CreatureIconSection'
import {
  CREATURE_APPEARANCE_MAX,
  CREATURE_NOTES_MAX,
  CREATURE_SIZES,
  checkCreatureType,
  createCreatureType,
  saveCreatureType,
  setCreatureTypeArchived,
  useCreatureTypes,
  type CreatureTypeInput,
  type CreatureTypeProblem,
} from './creatureTypes'
import { bestiaryPath, creaturePath } from './paths'

const t = de.bestiary
const p = t.page

/** What the page lets the DM change, held while the pencil is open. */
interface Draft {
  name: string
  size: CreatureSize
  /** As typed: a whole number, or what isn't one yet. */
  initiative: string
  rollMode: InitiativeRollMode
  appearance: string
  notes: string
}

const draftOf = (type: LocalCreatureType): Draft => ({
  name: type.name,
  size: type.size,
  initiative: String(type.initiativeModifier ?? 0),
  rollMode: type.initiativeRollMode ?? 'normal',
  appearance: type.appearance,
  notes: type.notes,
})

const inputOf = (draft: Draft): CreatureTypeInput => ({
  name: draft.name,
  size: draft.size,
  appearance: draft.appearance,
  notes: draft.notes,
  initiativeModifier: draft.initiative.trim() === '' ? Number.NaN : Number(draft.initiative),
  initiativeRollMode: draft.rollMode,
})

/** What "Neue Kreaturenart" edits until it is saved: nothing is stored before that. */
const BLANK: Draft = {
  name: '',
  size: 'medium',
  initiative: '0',
  rollMode: 'normal',
  appearance: '',
  notes: '',
}

export function CreaturePage({ isNew = false }: { isNew?: boolean }) {
  const { campaignId = '', typeId = '' } = useParams()
  return (
    <BestiaryGate campaignId={campaignId}>
      {() => <CreatureLoader campaignId={campaignId} typeId={typeId} isNew={isNew} />}
    </BestiaryGate>
  )
}

/** /kampagnen/:campaignId/bestiarium/neu: the page as editor for a new type. */
export function NewCreaturePage() {
  return <CreaturePage isNew />
}

function CreatureLoader({
  campaignId,
  typeId,
  isNew,
}: {
  campaignId: string
  typeId: string
  isNew: boolean
}) {
  const { db } = useLocalUser()
  const types = useCreatureTypes(db, campaignId)
  if (types === undefined) return <Loading />
  const type = isNew ? null : types.find((candidate) => candidate.id === typeId)
  if (type === undefined) {
    return (
      <div className="flex flex-col pb-8">
        <BackLink to={bestiaryPath(campaignId)} label={t.title} />
        <PageTitle>{p.unknownTitle}</PageTitle>
        <p className="text-dim">{p.unknownBody}</p>
      </div>
    )
  }
  return (
    <CreatureView
      key={type?.id ?? 'neu'}
      campaignId={campaignId}
      type={type}
      others={types.filter((other) => other.id !== type?.id)}
    />
  )
}

function CreatureView({
  campaignId,
  type,
  others,
}: {
  campaignId: string
  /** The stored type, kept up to date; null for one that doesn't exist yet. */
  type: LocalCreatureType | null
  /** The campaign's other types, archived ones included: their names are taken. */
  others: LocalCreatureType[]
}) {
  const isNew = type === null
  const { db } = useLocalUser()
  const icons = useCreatureIcons(campaignId)
  // Null while reading.
  const [draft, setDraft] = useState<Draft | null>(isNew ? BLANK : null)
  const [submitted, setSubmitted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  // Set just before leaving on purpose (saved, or cancelled), so the leave warning stays quiet.
  const leaving = useRef(false)

  const stored = type ? draftOf(type) : BLANK
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored)
  useLeaveWarning(dirty, () => saving || leaving.current)

  const problems = draft ? checkCreatureType(inputOf(draft), others) : []
  // An empty name isn't an error before the DM tried to save.
  const shown = problems.filter((problem) => submitted || problem !== 'nameMissing')
  const has = (problem: CreatureTypeProblem) => shown.includes(problem)

  function change(fields: Partial<Draft>) {
    setFailed(false)
    setDraft((current) => current && { ...current, ...fields })
  }

  function open() {
    setSubmitted(false)
    setFailed(false)
    if (type) setDraft(draftOf(type))
  }

  /** Writes the draft to this browser; the stored type, or null when it can't be saved. */
  async function write(): Promise<LocalCreatureType | null> {
    if (!draft) return null
    setSubmitted(true)
    if (problems.length > 0) return null
    setSaving(true)
    try {
      const result = type
        ? await saveCreatureType(db, type.id, inputOf(draft))
        : await createCreatureType(db, campaignId, inputOf(draft))
      if (result.ok) return result.type
      setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
    return null
  }

  async function submit() {
    const saved = await write()
    if (!saved) return
    if (!isNew) return setDraft(null)
    leaving.current = true
    void navigate(creaturePath(campaignId, saved.id), { replace: true })
  }

  function cancel() {
    if (!isNew) return setDraft(null)
    leaving.current = true
    void navigate(bestiaryPath(campaignId))
  }

  /** Before an icon job: writes unsaved edits without leaving the editor. */
  async function saveDraft(): Promise<boolean> {
    if (!dirty) return true
    return (await write()) !== null
  }

  const name = type?.name ?? ''
  const archived = type !== null && type.archivedAt !== null
  const nameProblem = has('nameMissing')
    ? t.problems.nameMissing
    : has('nameTooLong')
      ? t.problems.nameTooLong
      : has('nameTaken')
        ? t.problems.nameTaken
        : undefined

  return (
    <div className="flex flex-col pb-12" style={{ '--ring': CREATURE_RING } as CSSProperties}>
      <BackLink to={bestiaryPath(campaignId)} label={t.title} />
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[18rem_1fr] lg:gap-12">
        <aside className="flex flex-col gap-4">
          <Portrait
            url={type ? icons.get(type.id)?.url : null}
            alt={t.icon.alt(name)}
            name={draft?.name || name}
            ring={CREATURE_RING}
          />
          {draft && type && (
            <CreatureIconSection
              campaignId={campaignId}
              type={type}
              saveDraft={saveDraft}
              layout="sidebar"
            />
          )}
          {isNew && <p className="text-sm text-dim">{p.iconAfterSave}</p>}
        </aside>

        <header className="max-w-3xl min-w-0">
          {draft ? (
            <div className="flex flex-col gap-4">
              {isNew && <Kicker>{t.newType}</Kicker>}
              <TextField
                label={t.name}
                required
                autoComplete="off"
                value={draft.name}
                invalid={nameProblem !== undefined}
                hint={nameProblem ?? t.nameHint}
                className="[&_input]:font-display [&_input]:text-2xl [&_input]:font-semibold"
                onChange={(event) => change({ name: event.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  label={t.size}
                  value={draft.size}
                  onChange={(event) => change({ size: event.target.value as CreatureSize })}
                >
                  {CREATURE_SIZES.map((value) => (
                    <option key={value} value={value}>
                      {t.sizeOption(de.sizes[value], footprint(value))}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={t.initiativeModifier}
                  type="number"
                  inputMode="numeric"
                  min={MODIFIER_MIN}
                  max={MODIFIER_MAX}
                  step={1}
                  value={draft.initiative}
                  invalid={has('initiativeInvalid')}
                  onChange={(event) => change({ initiative: event.target.value })}
                />
                <SelectField
                  label={t.initiativeRollMode}
                  value={draft.rollMode}
                  onChange={(event) =>
                    change({ rollMode: event.target.value as InitiativeRollMode })
                  }
                >
                  {ROLL_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {de.dice.mode[mode]}
                    </option>
                  ))}
                </SelectField>
              </div>
              <p
                className={`-mt-2 text-sm ${has('initiativeInvalid') ? 'text-red-300' : 'text-dim'}`}
              >
                {has('initiativeInvalid') ? t.problems.initiativeInvalid : t.initiativeModifierHint}
              </p>
            </div>
          ) : (
            type && (
              <div className="flex flex-col gap-3">
                <Kicker>{archived ? p.archivedKicker : p.kicker}</Kicker>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <SectionHeading level={1}>{type.name}</SectionHeading>
                  <Button aria-label={t.edit(type.name)} onClick={open} className="gap-2">
                    <PencilIcon className="size-4" />
                    {de.sheet.editButton}
                  </Button>
                  {!archived && (
                    <Button
                      variant="quiet"
                      onClick={() => void setCreatureTypeArchived(db, type.id, true)}
                    >
                      {t.archive}
                    </Button>
                  )}
                </div>
                {archived && (
                  <div className="flex max-w-2xl flex-wrap items-center gap-3 rounded-sm border border-candle/25 bg-panel/60 px-4 py-3">
                    <p className="flex-1 text-sm text-dim">{p.archivedNote}</p>
                    <Button
                      aria-label={t.restoreLabel(type.name)}
                      onClick={() => void setCreatureTypeArchived(db, type.id, false)}
                    >
                      {t.restore}
                    </Button>
                  </div>
                )}
                <Facts
                  facts={[
                    [t.size, de.sizes[type.size]],
                    [p.footprint, p.footprintValue(footprint(type.size))],
                    [
                      p.initiative,
                      p.initiativeValue(
                        formatModifier(type.initiativeModifier ?? 0),
                        de.dice.withMode[type.initiativeRollMode ?? 'normal'],
                      ),
                    ],
                  ]}
                />
              </div>
            )
          )}
        </header>
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-3xl flex-col gap-10">
        <Story
          title={t.appearance}
          hint={t.appearanceHint}
          value={draft ? draft.appearance : (type?.appearance ?? '')}
          max={CREATURE_APPEARANCE_MAX}
          rows={3}
          editing={draft !== null}
          invalid={has('appearanceTooLong')}
          onChange={(appearance) => change({ appearance })}
        />
        <Story
          title={t.notes}
          hint={t.notesHint}
          value={draft ? draft.notes : (type?.notes ?? '')}
          max={CREATURE_NOTES_MAX}
          rows={5}
          editing={draft !== null}
          invalid={has('notesTooLong')}
          onChange={(notes) => change({ notes })}
        />
      </div>

      {draft && (
        <EditBar
          label={isNew ? t.newTitle : t.editTitle(name)}
          error={failed ? t.saveFailed : shown.length > 0 ? t.problems[shown[0]] : null}
          dirty={dirty}
          busy={saving}
          onCancel={cancel}
          onSave={() => void submit()}
        />
      )}
    </div>
  )
}
