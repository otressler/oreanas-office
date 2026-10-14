// Suggested feature kinds. The kind is free text (it also feeds the image prompt); a
// suggestion only presets whether the feature blocks movement, and the DM can change it.
import { de } from '../../text/de'

type SuggestionKey = keyof typeof de.editorFeatures.kinds

/** Whether each suggested kind blocks movement: you cross a bridge but not a pillar. */
const BLOCKS: Record<SuggestionKey, boolean> = {
  bridge: false,
  door: false,
  stairs: false,
  ladder: false,
  platform: false,
  pillar: true,
  tree: true,
  rock: true,
  crate: true,
  barrel: true,
  table: true,
  altar: true,
  well: true,
  wagon: true,
  statue: true,
}

export interface KindSuggestion {
  /** German, as the DM sees and stores it. */
  kind: string
  blocksMovement: boolean
}

export const KIND_SUGGESTIONS: readonly KindSuggestion[] = (
  Object.keys(BLOCKS) as SuggestionKey[]
).map((key) => ({ kind: de.editorFeatures.kinds[key], blocksMovement: BLOCKS[key] }))

/** The suggestion a typed or picked kind matches, ignoring case and spaces around it. */
export function suggestionFor(kind: string): KindSuggestion | undefined {
  const wanted = kind.trim().toLocaleLowerCase('de-DE')
  return KIND_SUGGESTIONS.find((s) => s.kind.toLocaleLowerCase('de-DE') === wanted)
}
