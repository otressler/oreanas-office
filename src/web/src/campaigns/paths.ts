/** The character page as editor for a character that doesn't exist yet. */
export function newCharacterPath(campaignId: string): string {
  return `/kampagnen/${campaignId}/charaktere/neu`
}

export function characterPath(campaignId: string, characterId: string): string {
  return `/kampagnen/${campaignId}/charaktere/${characterId}`
}
