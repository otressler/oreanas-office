// The copy of the user's campaigns from the last time online
// (knowledge/decisions/offline-prep-pwa.md, "Campaigns offline"), so maps can be
// built for them offline. Refreshed whenever the campaign list loads.
import { useLiveQuery } from 'dexie-react-hooks'
import type { CampaignSummary } from '../api/types'
import type { CampaignCopy, OfflineDb } from './db'

/** Replaces the copy with the campaigns the server just listed. */
export async function saveCampaignCopies(
  db: OfflineDb,
  campaigns: readonly CampaignSummary[],
): Promise<void> {
  const savedAt = new Date().toISOString()
  const copies: CampaignCopy[] = campaigns.map(({ id, name, myRole }) => ({
    id,
    name,
    myRole,
    savedAt,
  }))
  await db.transaction('rw', db.campaigns, async () => {
    await db.campaigns.clear()
    await db.campaigns.bulkPut(copies)
  })
}

/** The copy of one campaign; undefined while loading, null when there is none. */
export function useCampaignCopy(
  db: OfflineDb,
  campaignId: string,
): CampaignCopy | null | undefined {
  return useLiveQuery(async () => (await db.campaigns.get(campaignId)) ?? null, [db, campaignId])
}

/** Every campaign in the copy, by name; undefined while loading. */
export function useCampaignCopies(db: OfflineDb): CampaignCopy[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.campaigns.toArray()
    const byName = new Intl.Collator('de-DE', { numeric: true }).compare
    return all.sort((a, b) => byName(a.name, b.name))
  }, [db])
}
