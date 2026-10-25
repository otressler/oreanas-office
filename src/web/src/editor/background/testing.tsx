// Test helpers for the "Hintergrund" panel: a stand-in for the image hub's connection,
// versions and budgets as the server sends them, and the panel rendered inside an editor.
import type { HubConnection } from '@microsoft/signalr'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createQueryClient } from '../../api/queryClient'
import type { ImageBudget, MapBackground, MapBackgrounds } from '../../api/types'
import { offlineDb } from '../../offline/db'
import { LocalUserContext } from '../../offline/localUser'
import { testUser } from '../../test/api'
import { EditorTargetContext } from '../encounter/store'
import { emptyMap, type EditorMap } from '../model'
import { createEditorStore, EditorStoreContext } from '../store'
import { CAMPAIGN_ID, seedMap, seedOffline } from '../testing'
import type { ImageHubEvents } from './hub'

/** A connection under the test's control: no server. */
export class FakeImageConnection {
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>()
  private readonly closeHandlers: ((error?: Error) => void)[] = []
  readonly invocations: { method: string; args: unknown[] }[] = []
  state: 'new' | 'starting' | 'started' | 'stopped' = 'new'
  private readonly hub: FakeImageHub

  constructor(hub: FakeImageHub) {
    this.hub = hub
  }

  async start(): Promise<void> {
    this.state = 'starting'
    await this.hub.startWith()
    if (this.state !== 'starting') throw new Error('stopped while starting')
    this.state = 'started'
  }

  async stop(): Promise<void> {
    if (this.state !== 'stopped') this.close()
  }

  invoke(method: string, ...args: unknown[]): Promise<unknown> {
    if (this.state !== 'started') return Promise.reject(new Error('not connected'))
    this.invocations.push({ method, args })
    return Promise.resolve(this.hub.respond(method, args))
  }

  on(name: string, handler: (...args: unknown[]) => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set())
    this.handlers.get(name)!.add(handler)
  }

  off(name: string, handler: (...args: unknown[]) => void) {
    this.handlers.get(name)?.delete(handler)
  }

  onclose(handler: (error?: Error) => void) {
    this.closeHandlers.push(handler)
  }

  /** The server sends a message. */
  emit<E extends keyof ImageHubEvents>(event: E, ...args: ImageHubEvents[E]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }

  /** The connection drops (or is stopped). */
  close(error?: Error) {
    this.state = 'stopped'
    for (const handler of this.closeHandlers) handler(error)
  }
}

/** Makes FakeImageConnections; `factory` goes where createImageConnection would. */
export class FakeImageHub {
  readonly connections: FakeImageConnection[] = []
  respond: (method: string, args: unknown[]) => unknown = () => ({ error: null })
  startWith: () => Promise<void> = () => Promise.resolve()

  factory = (): HubConnection => {
    const connection = new FakeImageConnection(this)
    this.connections.push(connection)
    return connection as unknown as HubConnection
  }

  get latest(): FakeImageConnection {
    const connection = this.connections.at(-1)
    if (!connection) throw new Error('no connection yet')
    return connection
  }

  /** Connections not stopped yet. */
  get open(): FakeImageConnection[] {
    return this.connections.filter((c) => c.state !== 'stopped')
  }

  reset() {
    this.connections.length = 0
    this.respond = () => ({ error: null })
    this.startWith = () => Promise.resolve()
  }
}

/** The hub the panel talks to in tests that mock './createConnection' with it. */
export const fakeImages = { hub: new FakeImageHub() }

export const budget = (fields: Partial<ImageBudget> = {}): ImageBudget => ({
  spentUsd: 0.42,
  limitUsd: 20,
  monthStart: '2026-10-01T00:00:00Z',
  available: true,
  ...fields,
})

let versionCount = 0

/** A version of a 10 × 8 map, done unless the fields say otherwise. */
export function version(fields: Partial<MapBackground> = {}): MapBackground {
  versionCount += 1
  const id = fields.id ?? `00000000-0000-0000-0000-${String(versionCount).padStart(12, '0')}`
  const status = fields.status ?? 'done'
  return {
    id,
    mapId: 'map',
    origin: 'generated',
    status,
    url: status === 'done' ? `/api/assets/${id}` : null,
    gridWidth: 10,
    gridHeight: 8,
    x: 0,
    y: 0,
    width: 10,
    height: 8,
    outdated: false,
    layoutChanged: false,
    failure: null,
    createdAt: '2026-10-14T18:30:00Z',
    finishedAt: status === 'done' ? '2026-10-14T18:30:40Z' : null,
    refinedFromId: null,
    instruction: null,
    ...fields,
  }
}

export const backgroundsOf = (
  versions: MapBackground[],
  fields: Partial<MapBackgrounds> = {},
): MapBackgrounds => ({ pickedAssetId: null, versions, budget: budget(), ...fields })

/**
 * Seeds a dm campaign and a map (synced at `baseVersion`) and renders `ui` inside an editor
 * on it. Returns the map's id and the query client.
 */
export async function renderInMapEditor(
  ui: ReactElement,
  {
    baseVersion = 3,
    doc = emptyMap('Klamm', 10, 8),
  }: { baseVersion?: number; doc?: EditorMap } = {},
) {
  await seedOffline()
  const record = await seedMap(doc)
  const db = offlineDb(testUser.id)
  await db.maps.update(record.id, {
    sync: { ...record.sync, baseVersion, changed: baseVersion === 0 },
  })
  const store = createEditorStore(doc, '')
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <LocalUserContext.Provider value={{ user: testUser, db }}>
        <EditorTargetContext.Provider value={{ campaignId: CAMPAIGN_ID, mapId: record.id }}>
          <EditorStoreContext.Provider value={store}>{ui}</EditorStoreContext.Provider>
        </EditorTargetContext.Provider>
      </LocalUserContext.Provider>
    </QueryClientProvider>,
  )
  return { mapId: record.id, queryClient, store, db, unmount }
}
