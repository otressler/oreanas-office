/** The character page as editor for a character that doesn't exist yet. */
export function newCharacterPath(campaignId: string): string {
  return `/kampagnen/${campaignId}/charaktere/neu`
}

/** The viewer's characters in their other campaigns, to take into this one. */
export function importCharacterPath(campaignId: string): string {
  return `/kampagnen/${campaignId}/charaktere/uebernehmen`
}

export function characterPath(campaignId: string, characterId: string): string {
  return `/kampagnen/${campaignId}/charaktere/${characterId}`
}
