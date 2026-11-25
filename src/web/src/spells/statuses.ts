// What a card offers as statuses (knowledge/features/spell-cards.md, "Statuses when a spell is
// added"): the editor suggests the conditions its texts mark, "[[festgesetzt]]", by the
// glossary's names of the conditions. It needs no uploaded glossary, so it works offline.
import type { SpellCard, SpellStatusOffer } from '../api/types'
import { CONDITION_ENTRIES, findByName, nameKey } from '../rules/glossary'
import { de } from '../text/de'
import { splitTerms } from './markupText'
import { statusOffers } from './queries'

/** The 15 condition keys in the library's order (StatusLibrary.Conditions on the server). */
export const CONDITION_KEYS = Object.keys(CONDITION_ENTRIES).filter((k) => k !== 'concentration')

// By the glossary's name ("Erschöpft") and the status's ("Erschöpfung").
const byName = new Map(
  CONDITION_KEYS.flatMap((k) => [
    [nameKey(CONDITION_ENTRIES[k]!), k] as const,
    [nameKey(de.statuses.library[k] ?? k), k] as const,
  ]),
)

/** The texts a card may mark terms in: description, effect rows and table rows. */
function markedTexts(card: SpellCard): string[] {
  return [
    card.description ?? '',
    ...(card.effects ?? []).map((effect) => effect.text ?? ''),
    ...(card.tables ?? []).flatMap((table) => [
      table.caption ?? '',
      ...(table.rows ?? []).flatMap((row) => [row.title ?? '', row.text ?? '']),
    ]),
  ]
}

/** The condition keys the card's texts mark, in the library's order. */
export function markedConditions(card: SpellCard): string[] {
  const found = new Set<string>()
  for (const text of markedTexts(card)) {
    for (const part of splitTerms(text)) {
      if (part.kind !== 'term') continue
      const condition = findByName(byName, part.text, part.target)
      if (condition) found.add(condition)
    }
  }
  return CONDITION_KEYS.filter((k) => found.has(k))
}

/** The conditions the editor lists: those marked and those ticked, in the library's order. */
export function conditionChoices(card: SpellCard): string[] {
  const shown = new Set([...markedConditions(card), ...(card.statuses ?? [])])
  return CONDITION_KEYS.filter((k) => shown.has(k))
}

/** What to offer after a spell was added: the spell and what's missing from the list. */
export interface PendingOffers {
  spellId: string
  spellName: string
  offers: SpellStatusOffer[]
}

/** The offers for a spell just added, or null when the list misses nothing (or they can't load). */
export async function loadOffers(
  campaignId: string,
  characterId: string,
  spellId: string,
  spellName: string,
): Promise<PendingOffers | null> {
  try {
    const offers = await statusOffers(campaignId, characterId, spellId)
    return offers.length > 0 ? { spellId, spellName, offers } : null
  } catch {
    // The spell is added either way; the statuses can still be added on the status list.
    return null
  }
}
