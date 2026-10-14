// The map file (knowledge/domain/battle-map.md, "Import file") as a tool in the browser:
// export a map from the editor, import a file as a new map in the map list. Both work
// offline. `creatures` belongs to the server's import and is ignored here.
//
// Only the file's structure is checked here (types, grid size, cells inside the grid,
// layout version), so the editor can open the result. The layout rules themselves
// (overlaps, entrances on the edge) are the editor's layout checks.
import type { LayoutCell, LayoutEntrance, LayoutFeature, MapLayout, Terrain } from '../api/types'
import { LAYOUT_SCHEMA_VERSION, MIN_MAP_SIZE, nextLayoutId, type EditorMap } from '../editor/model'
import { limits } from '../lib/limits'
import { de } from '../text/de'

const t = de.maps.file

/** A file that can't become a map; the message is German and says why. */
export class MapFileError extends Error {}

/** What an exported file holds: the import-file format without creatures. */
export interface MapFile {
  name: string
  width: number
  height: number
  scene: string
  vibe: string
  lighting: string
  layout: MapLayout
}

/** The map as a file the import (here or on the server) reads back. */
export function toMapFile(map: EditorMap): MapFile {
  const { name, width, height, scene, vibe, lighting, layout } = map
  return { name, width, height, scene, vibe, lighting, layout }
}

/** A file name from the map's name: "Schluchtübergang.json". */
export function mapFileName(name: string): string {
  const safe = name
    // Characters Windows, macOS or Android refuse in file names, and control characters.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  return `${safe || t.fallbackName}.json`
}

/** Starts a download of the map file; needs no connection. */
export function downloadMapFile(map: EditorMap): void {
  const blob = new Blob([JSON.stringify(toMapFile(map), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = mapFileName(map.name)
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers start the download only after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const TERRAINS: readonly Terrain[] = ['void', 'floor', 'difficult', 'water', 'wall']
const ENTRANCE_KINDS: readonly LayoutEntrance['kind'][] = ['entrance', 'exit', 'both']

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isInt = (value: unknown): value is number => Number.isInteger(value)
const isMissing = (value: unknown) => value === undefined || value === null
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Reads a map file's text as a new map, or throws a MapFileError. */
export function parseMapFile(text: string): EditorMap {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new MapFileError(t.unreadable)
  }
  if (
    !isObject(parsed) ||
    !isObject(parsed.layout) ||
    typeof parsed.name !== 'string' ||
    !isNumber(parsed.width) ||
    !isNumber(parsed.height)
  ) {
    throw new MapFileError(t.notAMap)
  }

  const name = parsed.name.trim()
  if (!name) throw new MapFileError(t.noName)
  if (name.length > limits.mapName) throw new MapFileError(t.nameTooLong(limits.mapName))

  const { width, height } = parsed
  const sizeOk = (n: number) => isInt(n) && n >= MIN_MAP_SIZE && n <= limits.mapSize
  if (!sizeOk(width) || !sizeOk(height)) throw new MapFileError(t.tooLarge(limits.mapSize))

  const description = (field: 'scene' | 'vibe' | 'lighting') => {
    const value = parsed[field]
    if (isMissing(value)) return ''
    if (typeof value !== 'string') throw new MapFileError(t.notAMap)
    if (value.length > limits.mapDescription) {
      throw new MapFileError(t.textTooLong(t.fields[field], limits.mapDescription))
    }
    return value
  }

  return {
    name,
    width,
    height,
    layout: parseLayout(parsed.layout, width, height),
    scene: description('scene'),
    vibe: description('vibe'),
    lighting: description('lighting'),
  }
}

function parseLayout(layout: Json, width: number, height: number): MapLayout {
  const version = layout.schemaVersion
  if (!isMissing(version)) {
    if (!isInt(version) || version < 1) throw new MapFileError(t.badLayout(t.layout))
    if (version > LAYOUT_SCHEMA_VERSION) throw new MapFileError(t.newerVersion)
  }
  const list = (value: unknown, required: boolean): unknown[] => {
    if (Array.isArray(value)) return value
    if (!required && isMissing(value)) return []
    throw new MapFileError(t.badLayout(t.layout))
  }
  const inside = (x: unknown, y: unknown) =>
    isInt(x) && isInt(y) && x >= 0 && y >= 0 && x < width && y < height

  const cells = list(layout.cells, true).map((cell, i): LayoutCell => {
    const bad = () => new MapFileError(t.badLayout(t.cell(i + 1)))
    if (!isObject(cell) || !inside(cell.x, cell.y)) throw bad()
    if (!TERRAINS.includes(cell.terrain as Terrain)) throw bad()
    if (!isMissing(cell.elevation) && !isNumber(cell.elevation)) throw bad()
    return {
      x: cell.x as number,
      y: cell.y as number,
      terrain: cell.terrain as Terrain,
      elevation: (cell.elevation as number | null | undefined) ?? 0,
    }
  })

  const features: LayoutFeature[] = []
  list(layout.features, false).forEach((feature, i) => {
    const bad = () => new MapFileError(t.badLayout(t.feature(i + 1)))
    if (!isObject(feature) || typeof feature.kind !== 'string') throw bad()
    const { x, y, w, h } = feature
    if (!isInt(x) || !isInt(y) || !isInt(w) || !isInt(h) || w < 1 || h < 1) throw bad()
    if (!isMissing(feature.label) && typeof feature.label !== 'string') throw bad()
    if (!isMissing(feature.elevation) && !isNumber(feature.elevation)) throw bad()
    if (!isMissing(feature.blocksMovement) && typeof feature.blocksMovement !== 'boolean') {
      throw bad()
    }
    features.push({
      id: layoutId('f', feature.id, features),
      kind: feature.kind,
      label: (feature.label as string | null | undefined) ?? '',
      x,
      y,
      w,
      h,
      elevation: (feature.elevation as number | null | undefined) ?? 0,
      blocksMovement: (feature.blocksMovement as boolean | null | undefined) ?? false,
    })
  })

  const entrances: LayoutEntrance[] = []
  list(layout.entrances, false).forEach((entrance, i) => {
    const bad = () => new MapFileError(t.badLayout(t.entrance(i + 1)))
    if (!isObject(entrance) || !ENTRANCE_KINDS.includes(entrance.kind as LayoutEntrance['kind'])) {
      throw bad()
    }
    if (!isMissing(entrance.label) && typeof entrance.label !== 'string') throw bad()
    if (!Array.isArray(entrance.cells)) throw bad()
    const cells = entrance.cells.map((cell: unknown) => {
      if (!Array.isArray(cell) || cell.length !== 2 || !inside(cell[0], cell[1])) throw bad()
      return [cell[0] as number, cell[1] as number]
    })
    entrances.push({
      id: layoutId('e', entrance.id, entrances),
      kind: entrance.kind as LayoutEntrance['kind'],
      label: (entrance.label as string | null | undefined) ?? '',
      cells,
    })
  })

  return { schemaVersion: LAYOUT_SCHEMA_VERSION, cells, features, entrances }
}

/** The file's id when it has a fresh one, else a new one ("f3"). */
function layoutId(prefix: 'f' | 'e', id: unknown, taken: readonly { id: string }[]): string {
  if (typeof id === 'string' && id.trim() && !taken.some((item) => item.id === id)) return id
  return nextLayoutId(prefix, taken)
}
