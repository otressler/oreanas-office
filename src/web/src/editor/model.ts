// The map editor's data (knowledge/features/dm-map-editor.md, domain/battle-map.md).
// The editor works on an EditorMap; the browser keeps it as a LocalMap with the
// fields stage 6 sync needs (knowledge/decisions/offline-prep-pwa.md, "Versions and IDs").
import type { BackgroundPlacement, MapGridStyle, MapLayout } from '../api/types'
import type { SyncState } from '../offline/sync'

export type { SyncState }

/** What the editor changes, and what undo and redo restore. */
export interface EditorMap {
  name: string
  /** Cells, at most limits.mapSize. */
  width: number
  height: number
  /** The layout document as the server stores it: sparse cells, features, entrances. */
  layout: MapLayout
  scene: string
  vibe: string
  lighting: string
  /**
   * Where the DM moved, scaled and turned the picked background; used only while its
   * assetId is the picked version. Records from before uploads leave it out (null).
   */
  backgroundPlacement?: BackgroundPlacement | null
  /** How the grid is drawn over a background picture; left out means 'normal'. */
  gridStyle?: MapGridStyle
}

/** A battle map kept in the browser (IndexedDB). */
export interface LocalMap extends EditorMap {
  /** A GUID made in the browser; the server keeps it at sync. */
  id: string
  campaignId: string
  copiedFromMapId: string | null
  /** ISO timestamp, set when a `dm` member archives the map. */
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  sync: SyncState
  /**
   * The record format. Readers upgrade older records when loading
   * (knowledge/decisions/backward-compatibility.md, rule 4).
   */
  recordVersion: number
}

export const LOCAL_MAP_RECORD_VERSION = 1

/** The layout format the editor writes (MapLayout.CurrentSchemaVersion on the server). */
export const LAYOUT_SCHEMA_VERSION = 1

/** The smallest and the default size of a new map, in cells. */
export const MIN_MAP_SIZE = 1
export const DEFAULT_MAP_SIZE = { width: 20, height: 15 } as const

/** A new, empty map: every cell void, nothing on it. */
export function emptyMap(name: string, width: number, height: number): EditorMap {
  return {
    name,
    width,
    height,
    layout: { schemaVersion: LAYOUT_SCHEMA_VERSION, cells: [], features: [], entrances: [] },
    scene: '',
    vibe: '',
    lighting: '',
    backgroundPlacement: null,
    gridStyle: 'normal',
  }
}

/** The editable part of a stored map. */
export function editorMapOf(map: LocalMap): EditorMap {
  const { name, width, height, layout, scene, vibe, lighting } = map
  const backgroundPlacement = map.backgroundPlacement ?? null
  const gridStyle = map.gridStyle ?? 'normal'
  return { name, width, height, layout, scene, vibe, lighting, backgroundPlacement, gridStyle }
}

/** Ids for features and entrances: short, unique within the layout ("f3", "e2"). */
export function nextLayoutId(prefix: 'f' | 'e', taken: readonly { id: string }[]): string {
  const used = new Set(taken.map((item) => item.id))
  for (let n = taken.length + 1; ; n++) {
    const id = `${prefix}${n}`
    if (!used.has(id)) return id
  }
}
