// The sample maps a DM can import without writing a file (knowledge/domain/battle-map.md,
// "Import file"). Loaded on demand: the open field alone is 60 kB.
import type { ImportMapRequest } from '../api/types'
import { de } from '../text/de'

const names = de.encounters.import.sampleNames

export interface SampleMap {
  id: string
  name: string
  width: number
  height: number
  load: () => Promise<ImportMapRequest>
}

// The files leave out optional fields, which the generated type lists as required.
const file = (module: Promise<{ default: unknown }>) =>
  module.then((m) => m.default as ImportMapRequest)

export const sampleMaps: SampleMap[] = [
  {
    id: 'gorge-crossing',
    name: names['gorge-crossing'],
    width: 20,
    height: 12,
    load: () => file(import('./maps/gorge-crossing.json')),
  },
  {
    id: 'crypt',
    name: names.crypt,
    width: 24,
    height: 16,
    load: () => file(import('./maps/crypt.json')),
  },
  {
    id: 'river-ford',
    name: names['river-ford'],
    width: 36,
    height: 12,
    load: () => file(import('./maps/river-ford.json')),
  },
  {
    id: 'open-field',
    name: names['open-field'],
    width: 40,
    height: 38,
    load: () => file(import('./maps/open-field.json')),
  },
]
