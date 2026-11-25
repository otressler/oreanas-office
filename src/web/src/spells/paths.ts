// German paths of the spell pages (knowledge/features/spell-cards.md).
export const spellPaths = {
  library: '/zauber',
  /** The creation page's editor with the spell's card draft ("Prüfen und übernehmen"). */
  checkDraft: (
    spellId: string,
    forCharacter?: { campaignId: string; characterId: string } | null,
  ) => `${spellPaths.create(forCharacter, spellId)}&vorschlag=1`,
  /** The creation page, for a character (back there after saving) and for one spell. */
  create: (forCharacter?: { campaignId: string; characterId: string } | null, spellId?: string) => {
    const params = new URLSearchParams()
    if (forCharacter) {
      params.set('kampagne', forCharacter.campaignId)
      params.set('charakter', forCharacter.characterId)
    }
    if (spellId) params.set('zauber', spellId)
    const query = params.toString()
    return query ? `/zauber/neu?${query}` : '/zauber/neu'
  },
  spell: (spellId: string) => `/zauber/${spellId}`,
  edit: (variantId: string) => `/zauber/varianten/${variantId}/bearbeiten`,
  ownVariant: (variantId: string) => `/zauber/varianten/${variantId}/eigene`,
  studio: (variantId: string) => `/zauber/varianten/${variantId}/studio`,
}
