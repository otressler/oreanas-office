// The sync client's entry points (knowledge/decisions/offline-prep-pwa.md, "Sync
// protocol"): one sync at a time per browser, a push then a pull, and a status for the
// editor header. The dialogs and the header item are in components.tsx.
import { useLiveQuery } from 'dexie-react-hooks'
import type { OfflineDb } from '../offline/db'
import { SYNC_VERSION, SYNC_VERSION_HEADER, SyncFailure } from './api'
import { useSyncDb } from './context'
import { pull, pullOpened } from './pull'
import { planPush, push, pushAll } from './push'
import { countUnsynced, heldRecords, useOnline, useSyncStore } from './state'

export { SYNC_VERSION, SYNC_VERSION_HEADER }

export type SyncStatus =
  /** "Alles synchronisiert" when pending is 0, else "3 Änderungen nicht synchronisiert". */
  | { state: 'idle'; pending: number }
  | { state: 'syncing' }
  | { state: 'offline'; pending: number }
  /** Conflicts or rejections are waiting. */
  | { state: 'attention'; pending: number; issues: number }
  /** "Bitte neu laden". */
  | { state: 'outdated' }
  /** Sign in again; the data is kept. */
  | { state: 'signedOut' }

export interface SyncResult {
  ok: boolean
  issues: number
}

export type SyncReason =
  | 'button'
  | 'leaveEditor'
  | 'online'
  | 'editorOpen'
  | 'beforeStart'
  | 'store'
  /** The session page opened, or a fight was moved or archived there. */
  | 'session'

// ---- One sync at a time -----------------------------------------------------------------

const memoryLocks = new Map<string, Promise<unknown>>()

/**
 * Runs `job` while holding the browser-wide lock of this user (Web Locks API), so two tabs
 * never sync at once. Without the API (old browsers, tests) it queues in this page.
 */
export function withSyncLock<T>(userId: string, job: () => Promise<T>): Promise<T> {
  const name = `oreana-sync-${userId}`
  if (typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function') {
    return navigator.locks.request(name, job)
  }
  const run = (memoryLocks.get(name) ?? Promise.resolve()).catch(() => {}).then(job)
  memoryLocks.set(name, run)
  return run
}

const userIdOf = (db: OfflineDb) => db.name.replace(/^oreana-/, '')

interface Waiting {
  promise: Promise<SyncResult>
  /** A push and a pull, not only a pull. */
  full: boolean
}

/** The sync waiting for its turn, per database. */
const waiting = new Map<string, Waiting>()

/**
 * Runs one sync (push, then pull) for the local user; one at a time per browser (Web Locks).
 * Requests that come in while a sync runs share one more run afterwards. The editor opening
 * only pulls.
 */
export function syncNow(db: OfflineDb, options: { reason?: SyncReason } = {}): Promise<SyncResult> {
  const reason = options.reason ?? 'button'
  // Automatic syncs never complain about a missing connection.
  if (reason !== 'button' && reason !== 'store' && !navigator.onLine) {
    return issuesOf(db).then((issues) => ({ ok: false, issues }))
  }
  const full = reason !== 'editorOpen'
  const queued = waiting.get(db.name)
  if (queued) {
    queued.full ||= full
    return queued.promise
  }
  const entry: Waiting = { full, promise: Promise.resolve({ ok: false, issues: 0 }) }
  entry.promise = withSyncLock(userIdOf(db), () => {
    waiting.delete(db.name)
    return round(db, entry.full)
  })
  waiting.set(db.name, entry)
  return entry.promise
}

/** What a failed sync leaves in the status. */
function noteFailure(error: unknown): void {
  const kind = error instanceof SyncFailure ? error.kind : 'failed'
  if (kind === 'offline') useSyncStore.setState({ offline: true, failed: false })
  else if (kind === 'outdated') useSyncStore.setState({ blocked: 'outdated', failed: false })
  else if (kind === 'signedOut') useSyncStore.setState({ blocked: 'signedOut', failed: false })
  else useSyncStore.setState({ failed: true })
}

function noteSuccess(): void {
  useSyncStore.setState({ offline: false, failed: false, blocked: null })
}

function noteCampaigns(created: number): void {
  if (created > 0) useSyncStore.setState((s) => ({ campaignsCreated: s.campaignsCreated + 1 }))
}

async function round(db: OfflineDb, full: boolean): Promise<SyncResult> {
  const store = useSyncStore
  // An old app version stays refused until the page reloads.
  if (store.getState().blocked === 'outdated') {
    return { ok: false, issues: await issuesOf(db) }
  }
  store.setState((s) => ({ running: s.running + 1 }))
  let ok = true
  try {
    if (full) noteCampaigns((await pushAll(db)).campaignsCreated)
    await pull(db, { held: heldRecords() })
    noteSuccess()
  } catch (error) {
    ok = false
    noteFailure(error)
  } finally {
    store.setState((s) => ({ running: s.running - 1 }))
  }
  return { ok, issues: await issuesOf(db) }
}

/** Never rejects: a closed or missing database only means nothing is left to count. */
async function issuesOf(db: OfflineDb): Promise<number> {
  try {
    return (await countUnsynced(db)).issues
  } catch {
    return 0
  }
}

/**
 * Called by an editor right after it read its map (and encounter): takes the server's newer
 * version of those records when this device hasn't changed them and `canTake` still says the
 * editor holds no edits. Resolves true when the offline database changed, so the editor must
 * read its records again. Never rejects; the editor-open sync reports connection trouble.
 */
export function refreshOpenedRecords(
  db: OfflineDb,
  campaignId: string,
  ids: readonly string[],
  canTake: () => boolean,
): Promise<boolean> {
  if (!navigator.onLine || useSyncStore.getState().blocked) return Promise.resolve(false)
  return withSyncLock(userIdOf(db), () => pullOpened(db, campaignId, ids, canTake)).catch(
    () => false,
  )
}

/**
 * Pushes the encounter and what it needs (its map, its creature types, a local campaign).
 * Resolves 'ready' when the server has the device's version, 'blocked' when a conflict or
 * rejection must be resolved first, 'offline' without a connection.
 */
export function syncBeforeStart(
  db: OfflineDb,
  encounterId: string,
): Promise<'ready' | 'blocked' | 'offline'> {
  return withSyncLock(userIdOf(db), async () => {
    const encounter = await db.encounters.get(encounterId)
    if (!encounter) return 'blocked'
    if (!navigator.onLine) return 'offline'

    const campaign = await db.campaigns.get(encounter.campaignId)
    const typeIds = new Set(encounter.tokens.map((token) => token.creatureTypeId))
    const scope = {
      campaignIds: new Set(campaign?.local ? [campaign.id] : []),
      ids: {
        creatureType: typeIds,
        battleMap: new Set([encounter.battleMapId]),
        encounter: new Set([encounter.id]),
      },
    }
    useSyncStore.setState((s) => ({ running: s.running + 1 }))
    try {
      const planned = await planPush(db, scope)
      if (planned.length > 0) noteCampaigns((await push(db, planned)).campaignsCreated)
      noteSuccess()
    } catch (error) {
      noteFailure(error)
      return error instanceof SyncFailure && error.kind === 'offline' ? 'offline' : 'blocked'
    } finally {
      useSyncStore.setState((s) => ({ running: s.running - 1 }))
    }

    // Everything the fight needs must be on the server: nothing changed, no issue left.
    const needed = [
      await db.encounters.get(encounter.id),
      await db.maps.get(encounter.battleMapId),
      ...(await db.creatureTypes.bulkGet([...typeIds])),
      ...(campaign?.local ? [campaign] : []),
    ]
    const stuck = needed.some(
      (record) => record?.sync && (record.sync.changed || record.sync.issue),
    )
    return stuck ? 'blocked' : 'ready'
  })
}

/**
 * Pushes the map (and its campaign when made offline) before a background job, since the
 * server paints from its own copy (knowledge/features/ai-map-generation.md, "Sync first").
 * Resolves 'ready' with the map's server version when the server has the device's version,
 * 'blocked' when a conflict or rejection must be resolved first, 'offline' without a
 * connection. The editor always holds its map; one missing from this device is 'blocked'.
 */
export function syncMapBeforeGenerate(
  db: OfflineDb,
  mapId: string,
): Promise<{ result: 'ready' | 'blocked' | 'offline'; version: number | null }> {
  return withSyncLock(userIdOf(db), async () => {
    const map = await db.maps.get(mapId)
    if (!navigator.onLine) return { result: 'offline' as const, version: null }
    if (!map) return { result: 'blocked' as const, version: null }

    const campaign = await db.campaigns.get(map.campaignId)
    const scope = {
      campaignIds: new Set(campaign?.local ? [campaign.id] : []),
      ids: {
        creatureType: new Set<string>(),
        battleMap: new Set([map.id]),
        encounter: new Set<string>(),
      },
    }
    useSyncStore.setState((s) => ({ running: s.running + 1 }))
    try {
      const planned = await planPush(db, scope)
      if (planned.length > 0) noteCampaigns((await push(db, planned)).campaignsCreated)
      noteSuccess()
    } catch (error) {
      noteFailure(error)
      const result =
        error instanceof SyncFailure && error.kind === 'offline' ? 'offline' : 'blocked'
      return { result, version: null }
    } finally {
      useSyncStore.setState((s) => ({ running: s.running - 1 }))
    }

    const after = await db.maps.get(mapId)
    const stuck = !after || after.sync.changed || after.sync.issue !== null
    return stuck
      ? { result: 'blocked' as const, version: null }
      : { result: 'ready' as const, version: after.sync.baseVersion }
  })
}

/**
 * Pushes a creature type (and its campaign when made offline) before an icon job, since
 * the server paints from its own copy of the name and appearance
 * (knowledge/features/token-icons.md). Like syncMapBeforeGenerate: 'ready' with the type's
 * server version, 'blocked' when a conflict or rejection must be resolved first (or the
 * device doesn't hold the type), 'offline' without a connection.
 */
export function syncCreatureTypeBeforeGenerate(
  db: OfflineDb,
  creatureTypeId: string,
): Promise<{ result: 'ready' | 'blocked' | 'offline'; version: number | null }> {
  return withSyncLock(userIdOf(db), async () => {
    const type = await db.creatureTypes.get(creatureTypeId)
    if (!navigator.onLine) return { result: 'offline' as const, version: null }
    if (!type) return { result: 'blocked' as const, version: null }

    const campaign = await db.campaigns.get(type.campaignId)
    const scope = {
      campaignIds: new Set(campaign?.local ? [campaign.id] : []),
      ids: {
        creatureType: new Set([type.id]),
        battleMap: new Set<string>(),
        encounter: new Set<string>(),
      },
    }
    useSyncStore.setState((s) => ({ running: s.running + 1 }))
    try {
      const planned = await planPush(db, scope)
      if (planned.length > 0) noteCampaigns((await push(db, planned)).campaignsCreated)
      noteSuccess()
    } catch (error) {
      noteFailure(error)
      const result =
        error instanceof SyncFailure && error.kind === 'offline' ? 'offline' : 'blocked'
      return { result, version: null }
    } finally {
      useSyncStore.setState((s) => ({ running: s.running - 1 }))
    }

    const after = await db.creatureTypes.get(creatureTypeId)
    const stuck = !after || after.sync.changed || after.sync.issue !== null
    return stuck
      ? { result: 'blocked' as const, version: null }
      : { result: 'ready' as const, version: after.sync.baseVersion }
  })
}

/** The current status, live. */
export function useSyncStatus(): SyncStatus {
  const db = useSyncDb()
  const { running, blocked, offline } = useSyncStore()
  const online = useOnline()
  const counts = useLiveQuery(async () => (db ? countUnsynced(db) : null), [db])
  const { pending, issues } = counts ?? { pending: 0, issues: 0 }

  if (running > 0) return { state: 'syncing' }
  if (blocked) return { state: blocked }
  if (issues > 0) return { state: 'attention', pending, issues }
  if (offline || !online) return { state: 'offline', pending }
  return { state: 'idle', pending }
}
