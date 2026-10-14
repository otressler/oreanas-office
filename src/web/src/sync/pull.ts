// The pull (knowledge/decisions/offline-prep-pwa.md, "Pull"): refresh the campaign copy,
// then for every campaign where the user is `dm` fetch what the server has newer. A pulled
// item never overwrites a record with unsynced changes; that becomes a conflict at the
// next push.
import { ApiRequestError } from '../api/errors'
import type { SyncItemVersion, SyncServerItem, SyncVersionList } from '../api/types'
import { saveCampaignCopies } from '../offline/campaigns'
import type { OfflineDb } from '../offline/db'
import { fetchCampaigns, fetchItems, fetchVersions } from './api'
import { ITEM_KINDS, itemTable, recordFromServer, type ItemKind } from './records'

/** The server accepts at most this many ids per fetch. */
const FETCH_LIMIT = 500

const VERSION_LIST_KEY = {
  creatureType: 'creatureTypes',
  battleMap: 'battleMaps',
  encounter: 'encounters',
} as const satisfies Record<ItemKind, keyof SyncVersionList>

export const lastPullKey = (campaignId: string) => `lastPull:${campaignId}`

export interface PullOptions {
  /** Records an open editor works on; they are left for the next pull. */
  held?: ReadonlySet<string>
}

/** Step 1 of the pull: the user's campaigns and roles. Returns the ones where they are `dm`. */
export async function pullCampaigns(db: OfflineDb): Promise<string[]> {
  const campaigns = await fetchCampaigns()
  await saveCampaignCopies(db, campaigns)
  return campaigns.filter((campaign) => campaign.myRole === 'dm').map((campaign) => campaign.id)
}

/** The whole pull: campaigns first, then the items of every campaign the user is `dm` in. */
export async function pull(db: OfflineDb, options: PullOptions = {}): Promise<void> {
  const dmCampaigns = await pullCampaigns(db)
  // Players pull only the campaign list: DM notes and prepared encounters never reach them.
  for (const campaignId of dmCampaigns) await pullCampaign(db, campaignId, options)
}

async function versionsOf(campaignId: string): Promise<SyncVersionList> {
  try {
    return await fetchVersions(campaignId)
  } catch (error) {
    // Lost `dm` rights (or the campaign): the same as every item gone from the list.
    if (error instanceof ApiRequestError && (error.status === 403 || error.status === 404)) {
      return { creatureTypes: [], battleMaps: [], encounters: [] }
    }
    throw error
  }
}

export async function pullCampaign(
  db: OfflineDb,
  campaignId: string,
  { held = new Set<string>() }: PullOptions = {},
): Promise<void> {
  const listed = await versionsOf(campaignId)
  const wanted: string[] = []
  for (const kind of ITEM_KINDS) {
    wanted.push(...(await reconcile(db, kind, campaignId, listed[VERSION_LIST_KEY[kind]], held)))
  }
  for (let start = 0; start < wanted.length; start += FETCH_LIMIT) {
    const items = await fetchItems(campaignId, wanted.slice(start, start + FETCH_LIMIT))
    for (const item of items) {
      if (item.campaignId === campaignId) await writeServerItem(db, item, held)
    }
  }
  await db.meta.put({ key: lastPullKey(campaignId), value: new Date().toISOString() })
}

/**
 * Compares the server's list with the records of one kind: drops or flags what is gone,
 * and returns the ids to fetch (new to the device, or at another version).
 */
async function reconcile(
  db: OfflineDb,
  kind: ItemKind,
  campaignId: string,
  listed: SyncItemVersion[],
  held: ReadonlySet<string>,
): Promise<string[]> {
  const table = itemTable(db, kind)
  const local = await table.where('campaignId').equals(campaignId).toArray()
  const byId = new Map(local.map((record) => [record.id, record]))
  const onServer = new Set(listed.map((entry) => entry.id))

  const wanted = listed.flatMap(({ id, version }) => {
    const record = byId.get(id)
    if (held.has(id)) return []
    if (!record) return [id]
    // Unsynced changes stay; the next push finds out whether it is a conflict.
    if (record.sync.changed) return []
    return record.sync.baseVersion === version ? [] : [id]
  })

  for (const record of local) {
    if (onServer.has(record.id)) {
      // Listed again after being gone (rights back): the warning no longer applies.
      if (record.sync.issue?.kind === 'vanished') {
        await table.update(record.id, { sync: { ...record.sync, issue: null } })
      }
      continue
    }
    // Never seen by the server (still to be pushed): it can't have vanished.
    if (record.sync.baseVersion === 0 || held.has(record.id)) continue
    await db.transaction('rw', table, async () => {
      const current = await table.get(record.id)
      if (!current || current.sync.baseVersion === 0) return
      if (!current.sync.changed) await table.delete(current.id)
      else
        await table.update(current.id, { sync: { ...current.sync, issue: { kind: 'vanished' } } })
    })
  }
  return wanted
}

/** Stores the server's copy unless the record has unsynced changes (or is open in the editor). */
export async function writeServerItem(
  db: OfflineDb,
  item: SyncServerItem,
  held: ReadonlySet<string> = new Set(),
): Promise<void> {
  if (item.kind === 'campaign' || held.has(item.id)) return
  const table = itemTable(db, item.kind)
  await db.transaction('rw', table, async () => {
    const current = await table.get(item.id)
    if (current?.sync.changed) return
    await table.put(recordFromServer(item, current))
  })
}

/**
 * For an editor that has just opened its records: takes the server's newer version of every
 * one the device hasn't changed, unless `canTake` says the editor already holds edits. A held
 * record is skipped by the normal pull, so without this the editor would show the old copy and
 * its next save would end in a conflict. Returns whether anything was written, so the editor
 * can reload its document.
 */
export async function pullOpened(
  db: OfflineDb,
  campaignId: string,
  ids: readonly string[],
  canTake: () => boolean,
): Promise<boolean> {
  const listed = await versionsOf(campaignId)
  const stale: string[] = []
  for (const kind of ITEM_KINDS) {
    const table = itemTable(db, kind)
    for (const entry of listed[VERSION_LIST_KEY[kind]]) {
      if (!ids.includes(entry.id)) continue
      const record = await table.get(entry.id)
      // Changed here, or flagged: the next push decides, not the pull.
      if (
        record &&
        !record.sync.changed &&
        !record.sync.issue &&
        record.sync.baseVersion !== entry.version
      ) {
        stale.push(entry.id)
      }
    }
  }
  if (stale.length === 0) return false
  const items = await fetchItems(campaignId, stale)
  // Checked after the request: the editor may have been edited while it ran.
  if (!canTake()) return false
  let written = false
  for (const item of items) {
    if (item.campaignId !== campaignId || item.kind === 'campaign') continue
    const table = itemTable(db, item.kind)
    await db.transaction('rw', table, async () => {
      const current = await table.get(item.id)
      if (current?.sync.changed || !canTake()) return
      await table.put(recordFromServer(item, current))
      written = true
    })
  }
  return written
}
