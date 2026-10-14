// Links to the map pages (routes.tsx).

export function mapListPath(campaignId: string): string {
  return `/kampagnen/${campaignId}/karten`
}

export function editorPath(campaignId: string, mapId: string): string {
  return `/kampagnen/${campaignId}/karten/${mapId}`
}
