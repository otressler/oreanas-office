// Test helpers for the map editor: a signed-in user on this device, campaigns and maps
// in the offline store, and an editor store for tool and panel tests.
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { CampaignRole } from '../api/types'
import { offlineDb } from '../offline/db'
import { rememberUser } from '../offline/identity'
import { LocalUserContext } from '../offline/localUser'
import { renderApp, testUser } from '../test/api'
import { createMap } from './maps'
import { emptyMap, type EditorMap, type LocalMap } from './model'
import { createEditorStore, EditorStoreContext, type EditorStore } from './store'
import type { CellPointer, EditorTool } from './tools'

export const CAMPAIGN_ID = 'c1'
/** The planned session seedOffline gives the test user. */
export const SESSION_ID = 's1'

/** The test user as the device's last user, with one campaign in the offline copy. */
export async function seedOffline({
  role = 'dm',
  campaignId = CAMPAIGN_ID,
  campaignName = 'Die Rabenküste',
}: { role?: CampaignRole; campaignId?: string; campaignName?: string } = {}) {
  rememberUser(testUser)
  const db = offlineDb(testUser.id)
  await db.campaigns.put({
    id: campaignId,
    name: campaignName,
    myRole: role,
    savedAt: new Date().toISOString(),
    local: false,
    sync: null,
  })
  // A planned session the test user runs, so new encounters have somewhere to go.
  await db.sessions.put({
    id: SESSION_ID,
    campaignId,
    title: 'Die Seilbrücke',
    date: '2026-10-17',
    status: 'planned',
    dmUserId: testUser.id,
    dmDisplayName: testUser.displayName,
  })
  return db
}

/** A map in the test user's offline store. */
export async function seedMap(
  map: EditorMap = emptyMap('Klamm', 10, 8),
  campaignId = CAMPAIGN_ID,
): Promise<LocalMap> {
  return createMap(offlineDb(testUser.id), campaignId, map)
}

/** Seeds a dm campaign and a map, then opens the editor on it through the app's routes. */
export async function renderEditor(map?: EditorMap) {
  await seedOffline()
  const record = await seedMap(map)
  const app = renderApp(`/kampagnen/${CAMPAIGN_ID}/karten/${record.id}`)
  return { ...app, record, db: offlineDb(testUser.id) }
}

/** Renders a tool panel or other editor part with its own store; returns the store. */
export function renderWithEditorStore(ui: ReactElement, doc: EditorMap = emptyMap('Klamm', 10, 8)) {
  const store = createEditorStore(doc, '')
  render(
    <LocalUserContext.Provider value={{ user: testUser, db: offlineDb(testUser.id) }}>
      <EditorStoreContext.Provider value={store}>{ui}</EditorStoreContext.Provider>
    </LocalUserContext.Provider>,
  )
  return store
}

/** A store for driving tools directly, without rendering anything. */
export function editorStoreFor(doc: EditorMap = emptyMap('Klamm', 10, 8)): EditorStore {
  return createEditorStore(doc, '')
}

/** A pointer at a cell, inside a 10 × 8 map unless `inside` says otherwise. */
export function pointerAt(x: number, y: number, extra: Partial<CellPointer> = {}): CellPointer {
  return {
    cell: { x, y },
    inside: true,
    pressed: true,
    shift: false,
    alt: false,
    mod: false,
    point: { x: x + 0.5, y: y + 0.5 },
    cellPx: 64,
    ...extra,
  }
}

/** Drags a tool along cells: down on the first, moves through the rest, up on the last. */
export function drag(
  tool: EditorTool,
  store: EditorStore,
  cells: [number, number][],
  extra?: Partial<CellPointer>,
) {
  const ctx = { store }
  const [first, ...rest] = cells
  if (!first) return
  tool.onPointerDown?.(pointerAt(first[0], first[1], extra), ctx)
  for (const [x, y] of rest) tool.onPointerMove?.(pointerAt(x, y, extra), ctx)
  const last = rest.at(-1) ?? first
  tool.onPointerUp?.(pointerAt(last[0], last[1], { ...extra, pressed: false }), ctx)
}
