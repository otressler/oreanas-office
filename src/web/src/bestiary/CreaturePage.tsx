// /kampagnen/:campaignId/bestiarium/:typeId — one creature type, read like a character's page
// and edited in place (knowledge/features/creature-page.md). The editor's side panel opens
// the same page as a dialog, straight in editing (CreatureDialog). It works offline from the
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
import { useRouteLeaveWarning, useUnloadWarning } from '../components/useLeaveWarning'
import { Button, Loading, PageTitle, SelectField, TextField } from '../components/ui'
import { MAX_MAX, MAX_MIN } from '../hitPoints/hitPoints'
import { MODIFIER_MAX, MODIFIER_MIN, ROLL_MODES, formatModifier } from '../initiative/initiative'
import { useLocalUser } from '../offline/localUser'
import type { LocalCreatureType } from '../offline/model'
import { Modal } from '../sync/Modal'
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
  /** As typed: a whole number, empty for none, or what isn't one yet. */
  hitPoints: string
  appearance: string
  notes: string
}

const draftOf = (type: LocalCreatureType): Draft => ({
  name: type.name,
  size: type.size,
  initiative: String(type.initiativeModifier ?? 0),
  rollMode: type.initiativeRollMode ?? 'normal',
  hitPoints: type.hitPoints == null ? '' : String(type.hitPoints),
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
  hitPoints: draft.hitPoints.trim() === '' ? null : Number(draft.hitPoints),
})

/** What "Neue Kreaturenart" edits until it is saved: nothing is stored before that. */
const BLANK: Draft = {
  name: '',
  size: 'medium',
  initiative: '0',
  rollMode: 'normal',
  hitPoints: '',
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

/** What the page does instead of navigating when it is open as a dialog. */
interface DialogHandlers {
  /** After saving; the caller closes the dialog. */
  onSaved: (type: LocalCreatureType) => void
  /** After archiving from the dialog; the caller closes it. */
  onArchived: (type: LocalCreatureType) => void
  /** Cancelled, or closed with nothing (left) to save. */
  onClose: () => void
}

/**
 * The creature page over the editor, for the side panel's "Ändern" and "Neue Kreaturenart":
 * already in editing, and closing again once saved or cancelled. `typeId` null makes a type.
 */
export function CreatureDialog({
  campaignId,
  typeId,
  ...handlers
}: { campaignId: string; typeId: string | null } & DialogHandlers) {
  const { db } = useLocalUser()
  const types = useCreatureTypes(db, campaignId)
  if (types === undefined) return null
  const type = typeId === null ? null : types.find((candidate) => candidate.id === typeId)
  if (type === undefined) return null
  return (
    <CreatureView
      key={type?.id ?? 'neu'}
      campaignId={campaignId}
      type={type}
      others={types.filter((other) => other.id !== type?.id)}
      dialog={handlers}
    />
  )
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
  dialog,
}: {
  campaignId: string
  /** The stored type, kept up to date; null for one that doesn't exist yet. */
  type: LocalCreatureType | null
  /** The campaign's other types, archived ones included: their names are taken. */
  others: LocalCreatureType[]
  /** Set when the page is open as a dialog over the editor. */
  dialog?: DialogHandlers
}) {
  const isNew = type === null
  const { db } = useLocalUser()
  const icons = useCreatureIcons(campaignId)
  // Null while reading; a dialog starts in editing.
  const [draft, setDraft] = useState<Draft | null>(isNew ? BLANK : dialog ? draftOf(type) : null)
  const [submitted, setSubmitted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  // Set just before leaving on purpose (saved, or cancelled), so the leave warning stays quiet.
  const leaving = useRef(false)

  const stored = type ? draftOf(type) : BLANK
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored)
  const quiet = () => saving || leaving.current
  useUnloadWarning(dirty)

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
    if (dialog) return dialog.onSaved(saved)
    if (!isNew) return setDraft(null)
    leaving.current = true
    void navigate(creaturePath(campaignId, saved.id), { replace: true })
  }

  function cancel() {
    if (dialog) return dialog.onClose()
    if (!isNew) return setDraft(null)
    leaving.current = true
    void navigate(bestiaryPath(campaignId))
  }

  /** The dialog's close button and Escape: typed-in changes are only dropped after asking. */
  function close() {
    if (dirty && !window.confirm(t.dialogDiscard)) return
    dialog?.onClose()
  }

  /** From the dialog's save bar: archives the stored type, dropping unsaved edits. */
  async function archive() {
    if (!type) return
    await setCreatureTypeArchived(db, type.id, true)
    dialog?.onArchived({ ...type, archivedAt: new Date().toISOString() })
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

  // Read, the texts run under the whole page; edited, they join the fields beside the portrait
  // and its tools, which would otherwise leave the right column empty.
  const texts = (
    <>
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
    </>
  )

  const sheet = (
    <div
      className={`flex flex-col ${dialog ? '' : 'pb-12'}`}
      style={{ '--ring': CREATURE_RING } as CSSProperties}
    >
      {!dialog && (
        <>
          <RouteLeaveWarning dirty={dirty} quiet={quiet} />
          <BackLink to={bestiaryPath(campaignId)} label={t.title} />
        </>
      )}
      <div
        className={`grid items-start gap-8 ${
          dialog ? 'lg:grid-cols-[16rem_1fr]' : 'mt-6 lg:grid-cols-[18rem_1fr] lg:gap-12'
        }`}
      >
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

        <div className={`flex min-w-0 flex-col ${dialog ? 'gap-8' : 'max-w-3xl gap-10'}`}>
          <header>
            {draft ? (
              <div className="flex flex-col gap-4">
                {isNew && !dialog && <Kicker>{t.newType}</Kicker>}
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
                <div className="grid gap-4 sm:grid-cols-[3fr_2fr_2fr]">
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
                  {has('initiativeInvalid')
                    ? t.problems.initiativeInvalid
                    : t.initiativeModifierHint}
                </p>
                <TextField
                  label={t.hitPoints}
                  type="number"
                  inputMode="numeric"
                  min={MAX_MIN}
                  max={MAX_MAX}
                  step={1}
                  value={draft.hitPoints}
                  invalid={has('hitPointsInvalid')}
                  hint={has('hitPointsInvalid') ? t.problems.hitPointsInvalid : t.hitPointsHint}
                  className="[&_input]:max-w-32"
                  onChange={(event) => change({ hitPoints: event.target.value })}
                />
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
                      [
                        p.hitPoints,
                        type.hitPoints == null ? p.noHitPoints : String(type.hitPoints),
                      ],
                    ]}
                  />
                </div>
              )
            )}
          </header>
          {draft && texts}
        </div>
      </div>

      {!draft && <div className="mx-auto mt-12 flex w-full max-w-3xl flex-col gap-10">{texts}</div>}

      {draft && (
        <EditBar
          label={isNew ? t.newTitle : t.editTitle(name)}
          error={failed ? t.saveFailed : shown.length > 0 ? t.problems[shown[0]] : null}
          dirty={dirty}
          busy={saving}
          extra={
            dialog &&
            type &&
            !archived && (
              <Button variant="quiet" onClick={() => void archive()}>
                {t.archive}
              </Button>
            )
          }
          onCancel={cancel}
          onSave={() => void submit()}
        />
      )}
    </div>
  )

  if (!dialog) return sheet
  return (
    <Modal size="page" title={isNew ? t.newTitle : t.editTitle(name)} onClose={close}>
      {sheet}
    </Modal>
  )
}

/** The page's guard against moving elsewhere in the app; the dialog asks on closing instead. */
function RouteLeaveWarning({ dirty, quiet }: { dirty: boolean; quiet: () => boolean }) {
  useRouteLeaveWarning(dirty, quiet)
  return null
}
