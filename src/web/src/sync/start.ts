// Starting an encounter needs the server to hold the device's version first
// (knowledge/decisions/offline-prep-pwa.md, "Automatic sync before starting"). The editor's
// start button and the campaign page's both go through here.
import type { OfflineDb } from '../offline/db'
import { de } from '../text/de'
import { syncBeforeStart } from './client'

/** `message` says why not; null means go on to the setup screen. */
export interface StartCheck {
  proceed: boolean
  message: string | null
}

/**
 * Syncs the encounter and what it needs when this device has it, and tells whether starting
 * can go on. An encounter the device doesn't have (made elsewhere) is the server's already.
 */
export async function syncThenStart(
  db: OfflineDb | null,
  encounterId: string,
): Promise<StartCheck> {
  if (!db || !(await db.encounters.get(encounterId))) return { proceed: true, message: null }
  const result = await syncBeforeStart(db, encounterId)
  if (result === 'ready') return { proceed: true, message: null }
  const t = de.encounterEditor
  return { proceed: false, message: result === 'blocked' ? t.startBlocked : t.startOffline }
}
