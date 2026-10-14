// The push (knowledge/decisions/offline-prep-pwa.md, "Push"): every changed record of the
// local user in one request, in the order campaigns, creature types, maps, encounters,
// and what the server answered per item written back to the records.
import type { SyncItemResult, SyncPushItem, SyncServerItem } from '../api/types'
import type { OfflineDb } from '../offline/db'
import type { SyncIssue, SyncState } from '../offline/sync'
import { pushItems } from './api'
import {
  campaignPushItem,
  isPushableRecord,
  itemTable,
  PUSH_ORDER,
  recordFromServer,
  recordPushItem,
  sameData,
  type ItemKind,
} from './records'

/** A record read for a push: what was sent, and the edit count it had then. */
export interface Planned {
  item: SyncPushItem
  editCount: number
}

export interface PushOutcome {
  /** A campaign made on this device reached the server. */
  campaignsCreated: number
}

/** Which changed records a push takes; the default is every one of them. */
export interface PushScope {
  campaignIds?: ReadonlySet<string>
  /** Per kind, the ids to push. A kind that is missing pushes all of its records. */
  ids?: Partial<Record<ItemKind, ReadonlySet<string>>>
}

/** The records that have to go to the server, in push order. */
export async function planPush(db: OfflineDb, scope: PushScope = {}): Promise<Planned[]> {
  const planned: Planned[] = []
  for (const kind of PUSH_ORDER) {
    if (kind === 'campaign') {
      const copies = await db.campaigns.toArray()
      for (const copy of copies) {
        if (!copy.local || !copy.sync || !isPushableRecord(kind, { sync: copy.sync })) continue
        if (scope.campaignIds && !scope.campaignIds.has(copy.id)) continue
        planned.push({ item: campaignPushItem(copy), editCount: copy.sync.editCount })
      }
      continue
    }
    const wanted = scope.ids?.[kind]
    const records = await itemTable(db, kind).toArray()
    for (const record of records) {
      if (wanted && !wanted.has(record.id)) continue
      if (!isPushableRecord(kind, record)) continue
      planned.push({ item: recordPushItem(kind, record), editCount: record.sync.editCount })
    }
  }
  return planned
}

/** Sends the planned items and writes the answers back. */
export async function push(db: OfflineDb, planned: Planned[]): Promise<PushOutcome> {
  const outcome: PushOutcome = { campaignsCreated: 0 }
  if (planned.length === 0) return outcome
  const { results } = await pushItems({ items: planned.map((p) => p.item) })
  for (const result of results) {
    const entry = planned.find((p) => p.item.id === result.id && p.item.kind === result.kind)
    if (!entry) continue
    if (await applyResult(db, entry, result)) outcome.campaignsCreated += 1
  }
  return outcome
}

/** Plans and sends everything that changed. */
export async function pushAll(db: OfflineDb, scope?: PushScope): Promise<PushOutcome> {
  return push(db, await planPush(db, scope))
}

function serverMark(server: SyncServerItem): SyncState['server'] {
  return { updatedAt: server.updatedAt, updatedBy: server.updatedByDisplayName ?? null }
}

/** Returns true when a campaign made here now exists on the server. */
async function applyResult(
  db: OfflineDb,
  entry: Planned,
  result: SyncItemResult,
): Promise<boolean> {
  const { item } = entry
  const server = result.server
  let outcome = result.outcome
  // A conflict whose server copy holds what we sent is a retry that already worked.
  if (outcome === 'conflict' && server && sameData(item, server)) outcome = 'saved'

  if (item.kind === 'campaign') return applyCampaign(db, item, outcome, result)
  const table = itemTable(db, item.kind)

  await db.transaction('rw', table, async () => {
    const current = await table.get(item.id)
    if (!current) return
    if ((outcome === 'created' || outcome === 'saved') && server) {
      if (current.sync.editCount === entry.editCount) {
        // Nothing changed meanwhile: the server's copy is the record (it trims names).
        await table.put(recordFromServer(server, current))
      } else {
        // Saved during the push: the new edits still have to go, on top of this version.
        await table.put({
          ...current,
          sync: {
            ...current.sync,
            baseVersion: server.version,
            issue: null,
            server: serverMark(server),
          },
        })
      }
      return
    }
    let issue: SyncIssue
    if (outcome === 'conflict' && server) issue = { kind: 'conflict', server }
    else {
      issue = {
        kind: 'rejected',
        error: result.error ?? { code: 'itemNotFound' },
        dependsOnId: result.dependsOnId,
        problems: result.problems,
        existingCreatureTypeId: result.existingCreatureTypeId,
      }
    }
    await table.put({ ...current, sync: { ...current.sync, issue } })
  })
  return false
}

async function applyCampaign(
  db: OfflineDb,
  item: SyncPushItem,
  outcome: SyncItemResult['outcome'],
  result: SyncItemResult,
): Promise<boolean> {
  const copy = await db.campaigns.get(item.id)
  if (!copy?.sync) return false
  if (outcome === 'created' || outcome === 'saved') {
    // The server has it now; the campaign list that follows brings the join code.
    await db.campaigns.put({
      ...copy,
      name: result.server?.campaign?.name ?? copy.name,
      local: false,
      sync: null,
    })
    return true
  }
  await db.campaigns.put({
    ...copy,
    sync: {
      ...copy.sync,
      issue: {
        kind: 'rejected',
        error: result.error ?? { code: 'idTaken' },
        dependsOnId: result.dependsOnId,
      },
    },
  })
  return false
}
