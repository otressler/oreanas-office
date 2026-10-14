// Campaigns made on this device and not synced yet (knowledge/decisions/offline-prep-pwa.md,
// "Campaigns offline"): a copy with an id made here, the creator as `dm`, no join code.
import { useLiveQuery } from 'dexie-react-hooks'
import type { CampaignCopy, OfflineDb } from '../offline/db'
import { lastUser } from '../offline/identity'
import { offlineDb } from '../offline/db'
import { newSyncState } from '../offline/sync'

/** A new campaign that exists only in this browser until the next sync. */
export async function createLocalCampaign(db: OfflineDb, name: string): Promise<CampaignCopy> {
  const copy: CampaignCopy = {
    id: crypto.randomUUID(),
    name: name.trim(),
    myRole: 'dm',
    savedAt: new Date().toISOString(),
    local: true,
    sync: newSyncState(),
  }
  await db.campaigns.add(copy)
  return copy
}

/**
 * The campaigns of this device that the server doesn't know yet, by name. Works for pages
 * behind the server gate too: the device's last user owns the database. Undefined while
 * loading.
 */
export function useLocalCampaigns(): CampaignCopy[] | undefined {
  const userId = lastUser()?.id
  return useLiveQuery(async () => {
    if (!userId) return []
    const all = await offlineDb(userId)
      .campaigns.filter((copy) => copy.local)
      .toArray()
    const byName = new Intl.Collator('de-DE', { numeric: true }).compare
    return all.sort((a, b) => byName(a.name, b.name))
  }, [userId])
}

/** One local campaign by id; undefined while loading, null when there is none. */
export function useLocalCampaign(campaignId: string): CampaignCopy | null | undefined {
  const userId = lastUser()?.id
  return useLiveQuery(async () => {
    if (!userId) return null
    const copy = await offlineDb(userId).campaigns.get(campaignId)
    return copy?.local ? copy : null
  }, [userId, campaignId])
}
