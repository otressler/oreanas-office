// Links to a session and the pages under it (routes.tsx).

export function sessionPath(campaignId: string, sessionId: string): string {
  return `/kampagnen/${campaignId}/sitzungen/${sessionId}`
}

/** Importing a map file or a sample map as a fight of the session. */
export function sessionImportPath(campaignId: string, sessionId: string): string {
  return `${sessionPath(campaignId, sessionId)}/importieren`
}

/** The setup screen that places the characters and starts the fight. */
export function setupPath(campaignId: string, sessionId: string, encounterId: string): string {
  return `${sessionPath(campaignId, sessionId)}/kampf/${encounterId}/aufstellen`
}

export function fightPath(campaignId: string, encounterId: string): string {
  return `/kampagnen/${campaignId}/kampf/${encounterId}`
}
