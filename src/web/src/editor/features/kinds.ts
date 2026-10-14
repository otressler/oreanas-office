// Suggested feature kinds, the catalog of the feature tool. The kind is free text (it also
// feeds the image prompt); a suggestion only presets whether the feature blocks movement,
// and the DM can change it.
import { de } from '../../text/de'

export type KindKey = keyof typeof de.editorFeatures.kinds

/** The catalog's sections, in order. */
export type KindGroup = 'passage' | 'nature' | 'structure' | 'furniture' | 'fire'

/**
 * Every suggested kind in catalog order, with its section and whether it blocks movement:
 * you cross a bridge but not a pillar.
 */
const KINDS: Record<KindKey, { group: KindGroup; blocks: boolean }> = {
  bridge: { group: 'passage', blocks: false },
  jetty: { group: 'passage', blocks: false },
  door: { group: 'passage', blocks: false },
  gate: { group: 'passage', blocks: false },
  trapdoor: { group: 'passage', blocks: false },
  stairs: { group: 'passage', blocks: false },
  ladder: { group: 'passage', blocks: false },
  ramp: { group: 'passage', blocks: false },
  platform: { group: 'passage', blocks: false },
  carpet: { group: 'passage', blocks: false },
  tree: { group: 'nature', blocks: true },
  log: { group: 'nature', blocks: true },
  bushes: { group: 'nature', blocks: false },
  rock: { group: 'nature', blocks: true },
  rubble: { group: 'nature', blocks: false },
  stalagmite: { group: 'nature', blocks: true },
  pillar: { group: 'structure', blocks: true },
  ruin: { group: 'structure', blocks: true },
  statue: { group: 'structure', blocks: true },
  well: { group: 'structure', blocks: true },
  altar: { group: 'structure', blocks: true },
  throne: { group: 'structure', blocks: true },
  sarcophagus: { group: 'structure', blocks: true },
  cage: { group: 'structure', blocks: true },
  table: { group: 'furniture', blocks: true },
  bench: { group: 'furniture', blocks: true },
  bed: { group: 'furniture', blocks: true },
  shelf: { group: 'furniture', blocks: true },
  counter: { group: 'furniture', blocks: true },
  crate: { group: 'furniture', blocks: true },
  chest: { group: 'furniture', blocks: true },
  barrel: { group: 'furniture', blocks: true },
  wagon: { group: 'furniture', blocks: true },
  tent: { group: 'furniture', blocks: true },
  campfire: { group: 'fire', blocks: true },
  brazier: { group: 'fire', blocks: true },
  fireplace: { group: 'fire', blocks: true },
}

export const KIND_GROUPS: readonly KindGroup[] = [
  'passage',
  'nature',
  'structure',
  'furniture',
  'fire',
]

export interface KindSuggestion {
  key: KindKey
  /** German, as the DM sees and stores it. */
  kind: string
  group: KindGroup
  blocksMovement: boolean
}

export const KIND_SUGGESTIONS: readonly KindSuggestion[] = (Object.keys(KINDS) as KindKey[]).map(
  (key) => ({
    key,
    kind: de.editorFeatures.kinds[key],
    group: KINDS[key].group,
    blocksMovement: KINDS[key].blocks,
  }),
)

/** Lower case without accents or umlauts, so "tur" finds "Tür". */
function fold(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** The suggestion a typed or picked kind matches, ignoring case and spaces around it. */
export function suggestionFor(kind: string): KindSuggestion | undefined {
  const wanted = kind.trim().toLocaleLowerCase('de-DE')
  return KIND_SUGGESTIONS.find((s) => s.kind.toLocaleLowerCase('de-DE') === wanted)
}

/** The suggestions whose name contains the search, in catalog order; all for an empty one. */
export function searchKinds(query: string): KindSuggestion[] {
  const wanted = fold(query)
  return KIND_SUGGESTIONS.filter((s) => fold(s.kind).includes(wanted))
}
