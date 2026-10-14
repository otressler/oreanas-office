// Test helpers for encounter mode: a map store and an encounter store for driving the
// creature tools, and a renderer with everything the encounter panels need.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { offlineDb } from '../../offline/db'
import { LocalUserContext } from '../../offline/localUser'
import { testUser } from '../../test/api'
import { mapWith, roomCells } from '../features/fixtures'
import type { EditorMap } from '../model'
import { CAMPAIGN_ID } from '../testing'
import { createEditorStore, EditorStoreContext, type EditorStore } from '../store'
import type { CellPointer, EditorTool, ToolContext } from '../tools'
import {
  createEncounterStore,
  EditorTargetContext,
  EncounterStoreContext,
  type EncounterMeta,
  type EncounterStore,
} from './store'
import type { EncounterDoc } from './tokens'

export const MAP_ID = 'map-1'
export const ENCOUNTER_ID = 'enc-1'

export const emptyEncounter = (extra: Partial<EncounterDoc> = {}): EncounterDoc => ({
  name: 'Hinterhalt',
  status: 'draft',
  archivedAt: null,
  tokens: [],
  ...extra,
})

export interface EncounterFixture {
  map: EditorStore
  encounter: EncounterStore
  ctx: ToolContext
}

/** A 10 × 8 room of floor with an encounter on it. */
export function encounterFixture(
  doc: EncounterDoc = emptyEncounter(),
  map: EditorMap = mapWith([], roomCells()),
  meta: Partial<EncounterMeta> = {},
): EncounterFixture {
  const mapStore = createEditorStore(map, '')
  const encounter = createEncounterStore(doc, {
    campaignId: CAMPAIGN_ID,
    mapId: MAP_ID,
    encounterId: ENCOUNTER_ID,
    readOnly: false,
    ...meta,
  })
  return { map: mapStore, encounter, ctx: { store: mapStore, encounter } }
}

/** A pointer at a cell (hovering unless `pressed`). */
export function at(x: number, y: number, extra: Partial<CellPointer> = {}): CellPointer {
  return {
    cell: { x, y },
    inside: true,
    pressed: false,
    shift: false,
    alt: false,
    mod: false,
    ...extra,
  }
}

/** A click: down and up on the same cell. */
export function click(tool: EditorTool, fixture: EncounterFixture, x: number, y: number) {
  tool.onPointerDown?.(at(x, y, { pressed: true }), fixture.ctx)
  tool.onPointerUp?.(at(x, y), fixture.ctx)
}

/** Presses on one cell, moves to another and lets go. */
export function dragTo(
  tool: EditorTool,
  fixture: EncounterFixture,
  from: [number, number],
  to: [number, number],
) {
  tool.onPointerDown?.(at(from[0], from[1], { pressed: true }), fixture.ctx)
  tool.onPointerMove?.(at(to[0], to[1], { pressed: true }), fixture.ctx)
  tool.onPointerUp?.(at(to[0], to[1]), fixture.ctx)
}

export function key(tool: EditorTool, fixture: EncounterFixture, k: string): boolean {
  return tool.onKeyDown?.(new KeyboardEvent('keydown', { key: k }), fixture.ctx) ?? false
}

/** Renders an encounter panel with both stores, the router and a query client. */
export function renderInEncounter(
  ui: ReactElement,
  fixture: EncounterFixture = encounterFixture(),
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LocalUserContext.Provider value={{ user: testUser, db: offlineDb(testUser.id) }}>
          <EditorTargetContext.Provider value={{ campaignId: CAMPAIGN_ID, mapId: MAP_ID }}>
            <EditorStoreContext.Provider value={fixture.map}>
              <EncounterStoreContext.Provider value={fixture.encounter}>
                {ui}
              </EncounterStoreContext.Provider>
            </EditorStoreContext.Provider>
          </EditorTargetContext.Provider>
        </LocalUserContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fixture
}
