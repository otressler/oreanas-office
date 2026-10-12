// Where in an import file the server found a problem. The error's `field` is the
// JSON path of the offending entry, e.g. "layout.cells[12]" (src/Server/Maps/MapFile.cs);
// people counting entries start at 1, so that becomes "Feld 13 in der Liste der Felder".
import { de } from '../text/de'

const t = de.encounters.import.field

const lists: [RegExp, (n: number) => string][] = [
  [/^layout\.cells\[(\d+)\]/, t.cell],
  [/^layout\.features\[(\d+)\]/, t.feature],
  [/^layout\.entrances\[(\d+)\]/, t.entrance],
  [/^creatures\[(\d+)\]/, t.creature],
]

const plain: Record<string, string> = {
  name: t.name,
  width: t.width,
  height: t.height,
  scene: t.scene,
  vibe: t.vibe,
  lighting: t.lighting,
  layout: t.layout,
  'layout.schemaVersion': t.schemaVersion,
}

/** A readable place for an import error's field, with the raw path for people editing the file. */
export function describeImportField(field: string): string {
  for (const [pattern, label] of lists) {
    const match = pattern.exec(field)
    if (match) return `${label(Number(match[1]) + 1)} (${field})`
  }
  const known = plain[field]
  return known ? `${known} (${field})` : field
}
