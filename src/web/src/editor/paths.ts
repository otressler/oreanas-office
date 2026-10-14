// Links to the map pages (routes.tsx).

export function mapListPath(campaignId: string): string {
  return `/kampagnen/${campaignId}/karten`
}

export function editorPath(campaignId: string, mapId: string): string {
  return `/kampagnen/${campaignId}/karten/${mapId}`
}

/** The editor in encounter mode: the map with an encounter's creatures on it. */
export function encounterEditorPath(
  campaignId: string,
  mapId: string,
  encounterId: string,
): string {
  return `/kampagnen/${campaignId}/karten/${mapId}/begegnungen/${encounterId}`
}
