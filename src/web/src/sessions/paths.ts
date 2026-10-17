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

/** The spectator screen of the session. */
export function spectatorPath(campaignId: string, sessionId: string): string {
  return `${sessionPath(campaignId, sessionId)}/zuschauen`
}

/** The same screen opened as a shared screen of local mode (knowledge/features/shared-table.md). */
export function sharedScreenPath(campaignId: string, sessionId: string): string {
  return `${spectatorPath(campaignId, sessionId)}?gemeinsam=1`
}

/** The join page the QR code opens; a session lets the page offer "Nur zuschauen" for it. */
export function joinPath(joinCode: string, sessionId?: string): string {
  return sessionId ? `/beitreten/${joinCode}?sitzung=${sessionId}` : `/beitreten/${joinCode}`
}

export function fightPath(campaignId: string, encounterId: string): string {
  return `/kampagnen/${campaignId}/kampf/${encounterId}`
}
