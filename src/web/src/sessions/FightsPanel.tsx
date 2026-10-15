// The fights of a session on its page (knowledge/features/session-planning.md, "Session
// page"); the running one also has its own block above, with "Zum Kampf". The list comes from the server, and the DM's device adds what it has that the
// server doesn't have yet. Only the session DM prepares, moves, archives and starts them;
// other `dm` members see them.
import { useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { EncounterStatus, Session } from '../api/types'
import { campaignKeys } from '../campaigns/queries'
import { Badge, Button, ButtonLink, Note, Panel } from '../components/ui'
import {
  editable,
  listSessionEncounters,
  setEncounterArchived,
} from '../editor/encounter/encounters'
import { gridOf, misplacedIds } from '../editor/encounter/tokens'
import { listMaps } from '../editor/maps'
import { encounterEditorPath } from '../editor/paths'
import { useWideScreen } from '../lib/useWideScreen'
import type { OfflineDb } from '../offline/db'
import type { LocalEncounter } from '../offline/model'
import { syncNow, syncThenStart, useSyncDb } from '../sync'
import { de } from '../text/de'
import { AddFightButton } from './AddFightDialog'
import { MoveFightDialog } from './MoveFightDialog'
import { sessionImportPath, setupPath } from './paths'

const t = de.sessionPage

/** A fight as the list shows it, from the device's copy where it has one. */
export interface FightRow {
  id: string
  name: string
  status: EncounterStatus
  archivedAt: string | null
  battleMapId: string
  mapName: string
  creatureCount: number
  createdAt: string
  /** Made on this device and not on the server yet. */
  localOnly: boolean
  /** A creature no longer stands validly on the changed map. */
  misplaced: boolean
  /** The device's copy; the editor and the session DM's changes need it. */
  local: LocalEncounter | null
}

export function FightsPanel({ campaignId, session }: { campaignId: string; session: Session }) {
  const db = useSyncDb()
  const queryClient = useQueryClient()
  const rows = useFightRows(db, campaignId, session)
  const [moving, setMoving] = useState<FightRow | null>(null)
  const [notSynced, setNotSynced] = useState(false)
  const isDm = session.isSessionDm
  const ended = session.status === 'ended'

  // The session DM's device brings its fights to the server and takes the server's,
  // so the list and the editor agree.
  useEffect(() => {
    if (!db || !isDm) return
    void syncNow(db, { reason: 'session' }).then(() =>
      queryClient.invalidateQueries({ queryKey: campaignKeys.session(campaignId, session.id) }),
    )
  }, [db, isDm, campaignId, session.id, queryClient])

  /** A change made on this device, then synced so the server and the other DMs see it. */
  async function changed() {
    if (!db) return
    const result = await syncNow(db, { reason: 'session' })
    setNotSynced(!result.ok || result.issues > 0)
    await queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
  }

  const active = rows.filter((row) => row.archivedAt === null)
  const archived = rows.filter((row) => row.archivedAt !== null)
  const hasReady = active.some((row) => row.status === 'ready')
  const hint = !isDm
    ? t.otherDm(session.dmDisplayName)
    : ended
      ? t.endedHint
      : hasReady && session.status === 'planned'
        ? t.startWhenRunning
        : hasReady && session.activeEncounter
          ? de.encounters.oneAtATime
          : null

  const row = (fight: FightRow) => (
    <FightRowView
      key={fight.id}
      campaignId={campaignId}
      session={session}
      fight={fight}
      db={db}
      onMove={() => setMoving(fight)}
      onArchive={async (archive) => {
        if (!db) return
        await setEncounterArchived(db, fight.id, archive)
        await changed()
      }}
    />
  )

  return (
    <Panel
      title={t.fightsTitle}
      action={
        isDm &&
        !ended && (
          <div className="flex flex-wrap gap-2">
            {db && <AddFightButton db={db} campaignId={campaignId} sessionId={session.id} />}
            <ButtonLink to={sessionImportPath(campaignId, session.id)}>{t.importMap}</ButtonLink>
          </div>
        )
      }
    >
      {hint && <p className="text-sm text-dim">{hint}</p>}
      {notSynced && <Note>{t.notSynced}</Note>}
      {active.length === 0 ? (
        <p className="text-dim">{t.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">{active.map(row)}</ul>
      )}
      {archived.length > 0 && (
        <details className="rounded-lg border border-line px-3 py-1">
          <summary className="cursor-pointer py-1 text-sm text-dim">
            {t.archived(archived.length)}
          </summary>
          <ul className="flex flex-col divide-y divide-line">{archived.map(row)}</ul>
        </details>
      )}
      {moving && db && (
        <MoveFightDialog
          db={db}
          campaignId={campaignId}
          sessionId={session.id}
          fight={moving}
          onClose={() => setMoving(null)}
          onMoved={async () => {
            setMoving(null)
            await changed()
          }}
        />
      )}
    </Panel>
  )
}

/** The server's list, with the device's copies laid over it, in the order they were added. */
function useFightRows(db: OfflineDb | null, campaignId: string, session: Session): FightRow[] {
  const local = useLiveQuery(
    async () => (db ? listSessionEncounters(db, session.id) : []),
    [db, session.id],
  )
  // Every fight that is on this device, wherever it is now: one moved away here and not
  // yet synced is no longer shown in this session.
  const elsewhere = useLiveQuery(
    async () =>
      db
        ? (await db.encounters.where('campaignId').equals(campaignId).toArray()).filter(
            (encounter) => encounter.sessionId !== session.id,
          )
        : [],
    [db, campaignId, session.id],
  )
  const maps = useLiveQuery(async () => (db ? listMaps(db, campaignId) : []), [db, campaignId])

  const mapsById = new Map((maps ?? []).map((map) => [map.id, map]))
  const movedAway = new Set((elsewhere ?? []).map((encounter) => encounter.id))
  const localById = new Map((local ?? []).map((encounter) => [encounter.id, encounter]))

  const fromLocal = (encounter: LocalEncounter): FightRow => {
    const map = mapsById.get(encounter.battleMapId)
    return {
      id: encounter.id,
      name: encounter.name,
      status: encounter.status,
      archivedAt: encounter.archivedAt,
      battleMapId: encounter.battleMapId,
      mapName: map?.name ?? '',
      creatureCount: encounter.tokens.length,
      createdAt: encounter.createdAt,
      localOnly: encounter.sync.baseVersion === 0,
      misplaced:
        editable(encounter) &&
        map !== undefined &&
        misplacedIds(gridOf(map), encounter.tokens).size > 0,
      local: encounter,
    }
  }

  const rows: FightRow[] = session.encounters
    .filter((encounter) => !movedAway.has(encounter.id))
    .map((encounter) => {
      const copy = localById.get(encounter.id)
      if (copy) return { ...fromLocal(copy), mapName: encounter.battleMapName }
      return {
        id: encounter.id,
        name: encounter.name,
        status: encounter.status,
        archivedAt: encounter.archivedAt ?? null,
        battleMapId: encounter.battleMapId,
        mapName: encounter.battleMapName,
        creatureCount: encounter.creatureCount,
        createdAt: encounter.createdAt,
        localOnly: false,
        misplaced: false,
        local: null,
      }
    })
  const listed = new Set(rows.map((row) => row.id))
  for (const encounter of local ?? []) {
    if (!listed.has(encounter.id)) rows.push(fromLocal(encounter))
  }
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function FightRowView({
  campaignId,
  session,
  fight,
  db,
  onMove,
  onArchive,
}: {
  campaignId: string
  session: Session
  fight: FightRow
  db: OfflineDb | null
  onMove: () => void
  onArchive: (archive: boolean) => Promise<void>
}) {
  const wide = useWideScreen()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const isDm = session.isSessionDm
  const prepares = isDm && fight.local !== null && editable(fight)
  const canStart =
    isDm &&
    fight.status === 'ready' &&
    fight.archivedAt === null &&
    !fight.misplaced &&
    session.status === 'active' &&
    !session.activeEncounter

  async function setUp() {
    setBusy(true)
    setMessage(null)
    try {
      // A fight prepared on this device goes to the server first, as with the editor's button.
      const check = await syncThenStart(db, fight.id)
      if (check.proceed) void navigate(setupPath(campaignId, session.id, fight.id))
      else setMessage(check.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-parchment">{fight.name}</span>
        <Badge tone={fight.status === 'active' ? 'candle' : 'dim'}>
          {de.encounterStatus[fight.status]}
        </Badge>
        {fight.localOnly && <Badge>{t.localOnly}</Badge>}
        {fight.misplaced && (
          <span role="img" aria-label={t.misplaced} title={t.misplaced} className="text-red-300">
            ⚠
          </span>
        )}
      </div>
      <span className="text-sm text-dim">
        {fight.mapName && `${de.encounterEditor.mapOf(fight.mapName)} · `}
        {de.encounters.creatures(fight.creatureCount)}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {canStart && (
          <Button variant="primary" busy={busy} onClick={() => void setUp()}>
            {de.encounters.setUp}
          </Button>
        )}
        {isDm && wide && fight.local && (
          <ButtonLink
            to={encounterEditorPath(campaignId, fight.battleMapId, fight.id)}
            aria-label={t.openEditorLabel(fight.name)}
          >
            {t.openEditor}
          </ButtonLink>
        )}
        {prepares && (
          <Button variant="quiet" aria-label={t.moveLabel(fight.name)} onClick={onMove}>
            {t.move}
          </Button>
        )}
        {prepares && session.status !== 'ended' && (
          <Button
            variant="quiet"
            aria-label={
              fight.archivedAt === null ? t.archiveLabel(fight.name) : t.restoreLabel(fight.name)
            }
            onClick={() => void onArchive(fight.archivedAt === null)}
          >
            {fight.archivedAt === null ? t.archive : t.restore}
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm text-parchment">
          {message}
        </p>
      )}
    </li>
  )
}
