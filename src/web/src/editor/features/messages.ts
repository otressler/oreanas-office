// German messages for the layout checks (editor/validation.ts).
import { limits } from '../../lib/limits'
import { de } from '../../text/de'
import type { EditorMap } from '../model'
import type { LayoutItem, LayoutProblem } from '../validation'

const t = de.editorFeatures.checks
/** "3, 4"; "?" for a malformed cell from an imported file. */
const cellText = (x: number, y: number) =>
  Number.isFinite(x) && Number.isFinite(y) ? de.editor.cell(x, y) : '?'

/** A feature as messages name it: by label, else kind, else its top-left cell. */
export function featureName(feature: { label: string; kind: string; x: number; y: number }) {
  const name = feature.label.trim() || feature.kind.trim()
  return name ? t.feature(name) : t.featureAt(cellText(feature.x, feature.y))
}

/** An entrance as messages name it: kind and label, else kind and its first cell. */
export function entranceName(entrance: { kind: string; label: string; cells: number[][] }) {
  const kinds: Record<string, string> = de.board.entranceKinds
  const kind = kinds[entrance.kind] ?? de.board.entranceKinds.entrance
  if (entrance.label.trim()) return t.entrance(kind, entrance.label.trim())
  const [x, y] = entrance.cells[0] ?? []
  return x !== undefined && y !== undefined ? t.entranceAt(kind, cellText(x, y)) : kind
}

function itemName(item: LayoutItem, map: EditorMap): string {
  switch (item.kind) {
    case 'map':
      return t.map
    case 'cell':
      return t.cell(cellText(item.x, item.y))
    case 'feature': {
      const feature = map.layout.features[item.index]
      return feature ? featureName(feature) : t.feature(item.id)
    }
    case 'entrance': {
      const entrance = map.layout.entrances[item.index]
      return entrance ? entranceName(entrance) : item.id
    }
  }
}

/** The name of the feature or entrance an `otherId` points to. */
function otherName(problem: LayoutProblem, map: EditorMap): string {
  const id = problem.otherId ?? ''
  if (problem.item.kind === 'feature') {
    const feature = map.layout.features.find((f) => f.id === id)
    return feature ? featureName(feature) : t.feature(id)
  }
  const entrance = map.layout.entrances.find((e) => e.id === id)
  return entrance ? entranceName(entrance) : id
}

export function problemMessage(problem: LayoutProblem, map: EditorMap): string {
  const p = t.problems
  const what = itemName(problem.item, map)
  const cell = problem.cell ? cellText(problem.cell.x, problem.cell.y) : ''
  switch (problem.code) {
    case 'mapSizeInvalid':
    case 'layoutVersionUnsupported':
    case 'nameMissing':
      return p[problem.code]()
    case 'textTooLong': {
      const field = problem.field ?? 'label'
      const isMapText = problem.item.kind === 'map'
      const max = !isMapText
        ? limits.layoutText
        : field === 'name'
          ? limits.mapName
          : limits.mapDescription
      return p.textTooLong(what, t.fields[field], max)
    }
    case 'entranceCellOutside':
    case 'entranceCellNotOnEdge':
    case 'entranceCellNotWalkable':
    case 'entranceCellDuplicate':
      return p[problem.code](what, cell)
    case 'entranceCellShared':
      return p.entranceCellShared(what, cell, otherName(problem, map))
    case 'featureOverlap':
      return p.featureOverlap(what, otherName(problem, map))
    default:
      return p[problem.code](what)
  }
}
