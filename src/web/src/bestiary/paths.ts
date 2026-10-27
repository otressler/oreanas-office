export function bestiaryPath(campaignId: string): string {
  return `/kampagnen/${campaignId}/bestiarium`
}

/** A creature type's page (knowledge/features/creature-page.md). */
export function creaturePath(campaignId: string, typeId: string): string {
  return `${bestiaryPath(campaignId)}/${typeId}`
}

/** The creature type's page as editor for a type that doesn't exist yet. */
export function newCreaturePath(campaignId: string): string {
  return `${bestiaryPath(campaignId)}/neu`
}
