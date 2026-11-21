// German paths of the spell pages (knowledge/features/spell-cards.md).
export const spellPaths = {
  library: '/zauber',
  create: (forCharacter?: { campaignId: string; characterId: string }) =>
    forCharacter
      ? `/zauber/neu?kampagne=${encodeURIComponent(forCharacter.campaignId)}&charakter=${encodeURIComponent(forCharacter.characterId)}`
      : '/zauber/neu',
  spell: (spellId: string) => `/zauber/${spellId}`,
  edit: (variantId: string) => `/zauber/varianten/${variantId}/bearbeiten`,
  ownVariant: (variantId: string) => `/zauber/varianten/${variantId}/eigene`,
  studio: (variantId: string) => `/zauber/varianten/${variantId}/studio`,
}
