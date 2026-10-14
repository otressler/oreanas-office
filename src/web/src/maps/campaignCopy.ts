// Keeps the offline copy of one campaign current from its page (offline/campaigns.ts
// refreshes the whole copy only when the campaign list loads). A DM who opens a
// campaign from a link, without the list, can then still reach its maps offline.
import { useEffect } from 'react'
import type { CampaignRole } from '../api/types'
import { offlineDb } from '../offline/db'
import { lastUser } from '../offline/identity'

export function useKeepCampaignCopy(
  campaign: { id: string; name: string; myRole: CampaignRole } | undefined,
): void {
  const id = campaign?.id
  const name = campaign?.name
  const myRole = campaign?.myRole
  useEffect(() => {
    const user = lastUser()
    if (!user || !id || !name || !myRole) return
    offlineDb(user.id)
      .campaigns.put({
        id,
        name,
        myRole,
        savedAt: new Date().toISOString(),
        local: false,
        sync: null,
      })
      // Without IndexedDB the page still works; only offline editing is lost.
      .catch(() => {})
  }, [id, name, myRole])
}
