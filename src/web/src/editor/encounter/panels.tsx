// The side panels of encounter mode: the placement tool's creature types, the selected
// token's properties, and the "Begegnung" tool's encounter itself (ready, archive,
// start). Its status and creature count are in the header (EncounterSummary).
import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { BestiaryList } from '../../bestiary/BestiaryList'
import { useCreatureTypes } from '../../bestiary/creatureTypes'
import { useSessions } from '../../campaigns/queries'
import { Badge, Button } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { useLocalUser } from '../../offline/localUser'
import { syncThenStart } from '../../sync'
import { de } from '../../text/de'
import { saveEncounter } from './encounters'
import { pickType, usePickedState } from './picked'
import { useEncounter, useEncounterStore } from './store'
import { useEditor } from '../store'
import {
  cleanLabel,
  gridOf,
  misplacedIds,
  notReadyReason,
  removeToken,
  renameToken,
  setArchived,
  setReady,
  LABEL_MAX,
  type NotReadyReason,
} from './tokens'
import { useOnline } from './useOnline'

const t = de.encounterEditor

const Help = ({ children }: { children: string }) => <p className="text-sm text-dim">{children}</p>

/** The placement tool's panel: pick a creature type, or make one. */
export function PlacePanel() {
  const { db } = useLocalUser()
  const campaignId = useEncounter((s) => s.meta.campaignId)
  const { type: picked, campaignId: pickedCampaign } = usePickedState()
  const types = useCreatureTypes(db, campaignId)

  // The pick is a copy of the type. Editing or archiving it in the list updates the pick;
  // here it is dropped when it belongs to another campaign or was archived elsewhere.
  useEffect(() => {
    if (!picked) return
    const elsewhere = pickedCampaign !== null && pickedCampaign !== campaignId
    const archived = types?.find((type) => type.id === picked.id)?.archivedAt != null
    if (elsewhere || archived) pickType(null)
  }, [types, picked, pickedCampaign, campaignId])

  return (
    <div className="flex flex-col gap-3">
      <Help>{picked ? t.placeHelp(picked.name) : t.placePickFirst}</Help>
      <BestiaryList campaignId={campaignId} pickedId={picked?.id ?? null} onPick={pickType} />
    </div>
  )
}

/** The select tool's panel: the selected token's label, type, size and place. */
export function SelectCreaturePanel() {
  const store = useEncounterStore()
  const token = useEncounter((s) => s.doc.tokens.find((item) => item.id === s.selectedId))
  const readOnly = useEncounter((s) => s.meta.readOnly)
  const campaignId = useEncounter((s) => s.meta.campaignId)
  const { db } = useLocalUser()
  const types = useCreatureTypes(db, campaignId)
  if (!token) return <Help>{t.selectHelp}</Help>
  const type = types?.find((item) => item.id === token.creatureTypeId)

  return (
    <div className="flex flex-col gap-3">
      <LabelField key={token.id} id={token.id} label={token.label} disabled={readOnly} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-dim">{t.type}</dt>
        <dd>{type?.name ?? '…'}</dd>
        <dt className="text-dim">{t.size}</dt>
        <dd>{de.sizes[token.size]}</dd>
        <dt className="text-dim">{t.position}</dt>
        <dd>{t.cell(token.x, token.y)}</dd>
      </dl>
      <Help>{t.selectKeys}</Help>
      {!readOnly && (
        <div>
          <Button onClick={() => store.getState().apply((doc) => removeToken(doc, token.id))}>
            {t.remove}
          </Button>
        </div>
      )}
    </div>
  )
}

/** The label of a token: the DM can rename it, trimmed, 1 to 40 characters. */
function LabelField({ id, label, disabled }: { id: string; label: string; disabled: boolean }) {
  const store = useEncounterStore()
  const fieldId = useId()
  // What the field shows while it has focus; the token keeps the last valid label.
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && cleanLabel(draft) === null

  function commit() {
    if (draft !== null) store.getState().apply((doc) => renameToken(doc, id, draft))
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm text-dim">
        {t.label}
      </label>
      <input
        id={fieldId}
        className={inputClass}
        value={draft ?? label}
        maxLength={LABEL_MAX}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        onFocus={() => setDraft(label)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
      />
      {invalid && <p className="text-sm text-red-300">{t.labelInvalid}</p>}
    </div>
  )
}

/** The encounter's status, archived mark and creature count, for the header. */
export function EncounterSummary() {
  const doc = useEncounter((s) => s.doc)
  return (
    <div className="flex items-center gap-2">
      <Badge tone={doc.status === 'ready' || doc.status === 'active' ? 'candle' : 'dim'}>
        {de.encounterStatus[doc.status]}
      </Badge>
      {doc.archivedAt !== null && <Badge>{t.archivedBadge}</Badge>}
      <span className="text-sm whitespace-nowrap text-dim">
        {de.encounters.creatures(doc.tokens.length)}
      </span>
    </div>
  )
}

/** The "Begegnung" tool's panel: "Bereit", start and archive. */
export function EncounterPanel() {
  const store = useEncounterStore()
  const doc = useEncounter((s) => s.doc)
  const meta = useEncounter((s) => s.meta)
  const map = useEditor((s) => s.doc)
  const grid = gridOf(map)
  const misplaced = misplacedIds(grid, doc.tokens)
  const labels = doc.tokens.filter((token) => misplaced.has(token.id)).map((token) => token.label)
  const reason = notReadyReason(doc, grid)
  const ready = doc.status === 'ready'

  if (meta.readOnly) return <Help>{t.readOnly(de.encounterStatus[doc.status])}</Help>

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          checked={ready}
          disabled={!ready && reason !== null}
          onChange={(event) =>
            store.getState().apply((current) => setReady(current, grid, event.target.checked))
          }
        />
        {t.ready}
      </label>
      {!ready && reason === 'archived' && <Help>{t.readyArchived}</Help>}
      {!ready && reason === 'misplaced' && <Help>{t.readyMisplaced(labels.join(', '))}</Help>}
      {!ready && reason === null && <Help>{t.readyHint}</Help>}
      {ready && reason === 'misplaced' && (
        <p role="alert" className="text-sm text-red-300">
          {t.readyBroken(labels.join(', '))}
        </p>
      )}

      <StartEncounter ready={ready} reason={reason} />

      <div>
        <Button
          onClick={() =>
            store
              .getState()
              .apply((current) =>
                setArchived(current, current.archivedAt === null ? new Date().toISOString() : null),
              )
          }
        >
          {doc.archivedAt === null ? t.archive : t.restore}
        </Button>
      </div>
    </div>
  )
}

/**
 * "Starten" for a ready, valid, unarchived encounter, when online and the signed-in user
 * is the session DM of the campaign's active session. The server fixes the rest at the
 * setup page.
 */
function StartEncounter({ ready, reason }: { ready: boolean; reason: NotReadyReason | null }) {
  const online = useOnline()
  if (!ready) return <Help>{t.startNeedsReady}</Help>
  if (!online) return <Help>{t.startOffline}</Help>
  return <StartOnline reason={reason} />
}

function StartOnline({ reason }: { reason: NotReadyReason | null }) {
  const store = useEncounterStore()
  const { campaignId, encounterId } = useEncounter((s) => s.meta)
  const { db } = useLocalUser()
  const navigate = useNavigate()
  const sessions = useSessions(campaignId)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (sessions.isPending) return null
  if (sessions.isError) return <Help>{t.startOffline}</Help>
  // The session this user runs right now, if any: only its DM starts fights.
  const session = sessions.data.find((s) => s.status === 'active' && s.isSessionDm)
  if (!session) return <Help>{t.startNeedsSession}</Help>
  if (session.activeEncounter) return <Help>{de.encounters.oneAtATime}</Help>

  async function start() {
    setBusy(true)
    setMessage(null)
    try {
      // The last edits may still be waiting for the autosave.
      const { doc, savedDoc } = store.getState()
      if (doc !== savedDoc) {
        await saveEncounter(db, encounterId, doc)
        store.setState({ savedDoc: doc })
      }
      const check = await syncThenStart(db, encounterId)
      if (check.proceed) {
        void navigate(
          `/kampagnen/${campaignId}/sitzungen/${session!.id}/kampf/${encounterId}/aufstellen`,
        )
        return
      }
      setMessage(check.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="primary" busy={busy} disabled={reason !== null} onClick={() => void start()}>
        {t.start}
      </Button>
      {reason === 'archived' && <Help>{t.startArchived}</Help>}
      {reason === 'misplaced' && <Help>{t.startMisplaced}</Help>}
      {message && (
        <p role="status" className="text-sm text-parchment">
          {message}
        </p>
      )}
    </div>
  )
}
