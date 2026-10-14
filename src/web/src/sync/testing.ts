// Test helpers for the sync client: an in-memory server that answers the sync API with the
// rules of the contract (versions, conflicts, rejections), and records for the offline
// database.
import { vi } from 'vitest'
import type {
  ApiErrorBody,
  CampaignSummary,
  StoreMap,
  SyncPushItem,
  SyncPushRequest,
  SyncItemResult,
  SyncServerItem,
} from '../api/types'
import { emptyMap, LOCAL_MAP_RECORD_VERSION, type LocalMap } from '../editor/model'
import type { OfflineDb } from '../offline/db'
import {
  LOCAL_CREATURE_TYPE_RECORD_VERSION,
  LOCAL_ENCOUNTER_RECORD_VERSION,
  type LocalCreatureType,
  type LocalEncounter,
} from '../offline/model'
import { newSyncState, pulledSyncState } from '../offline/sync'
import { json, testUser } from '../test/api'

export const CAMPAIGN = 'c0000000-0000-0000-0000-000000000001'
const TIME = '2026-10-14T10:00:00.000Z'

export interface Call {
  method: string
  path: string
  headers: Headers
  body: unknown
}

export class FakeServer {
  readonly calls: Call[] = []
  readonly items = new Map<string, SyncServerItem>()
  campaigns: CampaignSummary[] = []
  store: StoreMap[] = []
  /** Answers for these ids are rejections. */
  readonly rejections = new Map<string, Partial<SyncItemResult> & { error: ApiErrorBody }>()
  /** Every /api/sync request gets this status (426, 401, 500). */
  syncStatus: number | null = null
  /** Campaigns where the version list is forbidden. */
  readonly forbidden = new Set<string>()
  /** fetch throws, as without a connection. */
  offline = false
  /** Runs once the push request arrived and before the server answers. */
  onPush: ((request: SyncPushRequest) => Promise<void> | void) | null = null
  private clock = 0

  constructor() {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => this.handle(input, init)),
    )
  }

  /** The server holds this item, e.g. one made on another device. */
  put(item: SyncServerItem): SyncServerItem {
    this.items.set(item.id, item)
    return item
  }

  push(): Call | undefined {
    return this.calls.find((call) => call.path === '/api/sync/push')
  }

  pushedIds(): string[] {
    return this.calls
      .filter((call) => call.path === '/api/sync/push')
      .flatMap((call) => (call.body as SyncPushRequest).items.map((item) => item.id))
  }

  private stamp(): string {
    this.clock += 1
    return new Date(Date.parse(TIME) + this.clock * 1000).toISOString()
  }

  private serverItem(item: SyncPushItem, version: number): SyncServerItem {
    const trim = <T extends { name: string }>(data: T | null) =>
      data && { ...data, name: data.name.trim() }
    return {
      id: item.id,
      kind: item.kind,
      campaignId: item.campaignId,
      version,
      updatedAt: this.stamp(),
      updatedByDisplayName: 'Jennie',
      campaign: trim(item.campaign),
      creatureType: trim(item.creatureType),
      map: trim(item.map),
      encounter: item.encounter && {
        ...item.encounter,
        name: item.encounter.name.trim(),
        sessionId: null,
        mapCopy: null,
      },
    }
  }

  private pushOne(item: SyncPushItem): SyncItemResult {
    const base = {
      id: item.id,
      kind: item.kind,
      server: null,
      error: null,
      dependsOnId: null,
      problems: null,
      existingCreatureTypeId: null,
    }
    const rejection = this.rejections.get(item.id)
    if (rejection) return { ...base, outcome: 'rejected', ...rejection }
    if (item.kind === 'campaign') {
      if (!this.campaigns.some((c) => c.id === item.id)) {
        this.campaigns.push({
          id: item.id,
          name: item.campaign!.name.trim(),
          myRole: 'dm',
          activeSession: null,
        })
      }
      const server = this.serverItem(item, 1)
      this.items.set(item.id, server)
      return { ...base, outcome: 'created', server }
    }
    const existing = this.items.get(item.id)
    if (!existing) {
      if (item.baseVersion > 0) {
        return { ...base, outcome: 'rejected', error: { code: 'itemNotFound' } }
      }
      const server = this.put(this.serverItem(item, 1))
      return { ...base, outcome: 'created', server }
    }
    const started =
      existing.encounter?.status === 'active' || existing.encounter?.status === 'ended'
    if (started || existing.version !== item.baseVersion) {
      return { ...base, outcome: 'conflict', server: existing }
    }
    const server = this.put(this.serverItem(item, existing.version + 1))
    return { ...base, outcome: 'saved', server }
  }

  private async handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch')
    const request = new Request(input, init)
    const url = new URL(request.url)
    const text = await request.text()
    const call: Call = {
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      body: text ? JSON.parse(text) : undefined,
    }
    this.calls.push(call)
    const route = `${call.method} ${call.path}`

    if (call.path.startsWith('/api/sync/') && this.syncStatus) {
      return json(this.syncStatus, this.syncStatus === 426 ? { code: 'syncOutdated' } : undefined)
    }
    if (route === 'GET /api/auth/me') return json(200, testUser)
    // Fails on purpose: the page stays signed in, and a test only looks at the request.
    if (route === 'POST /api/auth/logout') return json(500)
    if (route === 'GET /api/campaigns') return json(200, this.campaigns)
    if (route === 'POST /api/sync/push') {
      const body = call.body as SyncPushRequest
      await this.onPush?.(body)
      return json(200, { results: body.items.map((item) => this.pushOne(item)) })
    }
    let match = /^\/api\/sync\/campaigns\/([^/]+)\/(versions|items)$/.exec(call.path)
    if (match) {
      const [, campaignId, what] = match
      if (this.forbidden.has(campaignId!)) return json(403)
      const own = [...this.items.values()].filter(
        (item) => item.campaignId === campaignId && item.kind !== 'campaign',
      )
      if (what === 'versions') {
        const list = (kind: string) =>
          own.filter((item) => item.kind === kind).map(({ id, version }) => ({ id, version }))
        return json(200, {
          creatureTypes: list('creatureType'),
          battleMaps: list('battleMap'),
          encounters: list('encounter'),
        })
      }
      const ids = new Set((call.body as { ids: string[] }).ids)
      return json(
        200,
        own.filter((item) => ids.has(item.id)),
      )
    }
    match = /^\/api\/campaigns\/([^/]+)\/map-store(?:\/([^/]+))?$/.exec(call.path)
    if (match) {
      const [, campaignId, mapId] = match
      if (call.method === 'GET') return json(200, this.store)
      const offered = this.store.find((map) => map.id === mapId)
      if (!offered) return json(409, { code: 'mapNotInStore' })
      const copy = this.put({
        id: `copy-${offered.id}`,
        kind: 'battleMap',
        campaignId: campaignId!,
        version: 1,
        updatedAt: this.stamp(),
        updatedByDisplayName: 'Jennie',
        campaign: null,
        creatureType: null,
        encounter: null,
        map: {
          name: offered.name,
          width: offered.width,
          height: offered.height,
          layout: offered.layout,
          scene: '',
          vibe: '',
          lighting: '',
          archivedAt: null,
          copiedFromMapId: offered.id,
        },
      })
      this.store = this.store.filter((map) => map.id !== offered.id)
      return json(200, copy)
    }
    return json(404)
  }
}

export function fakeServer(): FakeServer {
  return new FakeServer()
}

// ---- Records ---------------------------------------------------------------------------------

let counter = 0
const nextId = () => `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`

/** A new campaign copy of the user, as the campaign list leaves it. */
export async function seedCampaign(
  db: OfflineDb,
  fields: { id?: string; name?: string; role?: 'dm' | 'player'; local?: boolean } = {},
) {
  const copy = {
    id: fields.id ?? CAMPAIGN,
    name: fields.name ?? 'Die Rabenküste',
    myRole: fields.role ?? 'dm',
    savedAt: TIME,
    local: fields.local ?? false,
    sync: fields.local ? newSyncState() : null,
  }
  await db.campaigns.put(copy)
  return copy
}

/** A map made on this device (never synced), or a synced one with `synced: version`. */
export async function seedMap(
  db: OfflineDb,
  fields: Partial<LocalMap> & { synced?: number } = {},
): Promise<LocalMap> {
  const { synced, ...rest } = fields
  const map: LocalMap = {
    ...emptyMap('Klamm', 10, 8),
    id: nextId(),
    campaignId: CAMPAIGN,
    copiedFromMapId: null,
    archivedAt: null,
    createdAt: TIME,
    updatedAt: TIME,
    sync: newSyncState(),
    recordVersion: LOCAL_MAP_RECORD_VERSION,
    ...rest,
  }
  if (synced) map.sync = { ...map.sync, baseVersion: synced, changed: false, editCount: 0 }
  await db.maps.put(map)
  return map
}

export async function seedType(
  db: OfflineDb,
  fields: Partial<LocalCreatureType> = {},
): Promise<LocalCreatureType> {
  const type: LocalCreatureType = {
    id: nextId(),
    campaignId: CAMPAIGN,
    name: 'Goblin',
    size: 'small',
    appearance: '',
    notes: '',
    archivedAt: null,
    createdAt: TIME,
    updatedAt: TIME,
    sync: newSyncState(),
    recordVersion: LOCAL_CREATURE_TYPE_RECORD_VERSION,
    ...fields,
  }
  await db.creatureTypes.put(type)
  return type
}

export async function seedEncounter(
  db: OfflineDb,
  fields: Partial<LocalEncounter> & { battleMapId: string },
): Promise<LocalEncounter> {
  const encounter: LocalEncounter = {
    id: nextId(),
    campaignId: CAMPAIGN,
    name: 'Hinterhalt',
    status: 'draft',
    archivedAt: null,
    tokens: [],
    sessionId: null,
    mapCopy: null,
    createdAt: TIME,
    updatedAt: TIME,
    sync: newSyncState(),
    recordVersion: LOCAL_ENCOUNTER_RECORD_VERSION,
    ...fields,
  }
  await db.encounters.put(encounter)
  return encounter
}

/** A server copy of a map, as another device saved it. */
export function serverMap(
  id: string,
  version: number,
  fields: { name?: string; campaignId?: string } = {},
): SyncServerItem {
  const { layout, width, height } = emptyMap('', 10, 8)
  return {
    id,
    kind: 'battleMap',
    campaignId: fields.campaignId ?? CAMPAIGN,
    version,
    updatedAt: '2026-10-14T09:00:00.000Z',
    updatedByDisplayName: 'Felix',
    campaign: null,
    creatureType: null,
    encounter: null,
    map: {
      name: fields.name ?? 'Klamm',
      width,
      height,
      layout,
      scene: '',
      vibe: '',
      lighting: '',
      archivedAt: null,
      copiedFromMapId: null,
    },
  }
}

export { pulledSyncState }
