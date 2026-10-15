// Queries for campaigns and what hangs off them. Keys nest under the campaign,
// so invalidating ['campaign', id] refreshes its members, characters and sessions.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { saveCampaignCopies } from '../offline/campaigns'
import { offlineDb } from '../offline/db'
import { lastUser } from '../offline/identity'

export const campaignKeys = {
  list: ['campaigns'] as const,
  detail: (campaignId: string) => ['campaign', campaignId] as const,
  characters: (campaignId: string) => ['campaign', campaignId, 'characters'] as const,
  sessions: (campaignId: string) => ['campaign', campaignId, 'sessions'] as const,
  session: (campaignId: string, sessionId: string) =>
    ['campaign', campaignId, 'sessions', sessionId] as const,
}

const path = (campaignId: string) => ({ params: { path: { campaignId } } })

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.list,
    queryFn: async () => {
      const campaigns = await unwrap(api.GET('/api/campaigns'))
      keepOfflineCopy(campaigns)
      return campaigns
    },
  })
}

/** The map editor works offline on the campaigns the user had last time online. */
function keepOfflineCopy(campaigns: Parameters<typeof saveCampaignCopies>[1]) {
  const user = lastUser()
  if (!user) return
  // A browser without IndexedDB still shows the list; only offline editing is lost.
  saveCampaignCopies(offlineDb(user.id), campaigns).catch(() => {})
}

/** `enabled: false` for a campaign made on this device, which the server doesn't know yet. */
export function useCampaign(campaignId: string, { enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: campaignKeys.detail(campaignId),
    queryFn: () => unwrap(api.GET('/api/campaigns/{campaignId}', path(campaignId))),
  })
}

export function useCharacters(campaignId: string) {
  return useQuery({
    queryKey: campaignKeys.characters(campaignId),
    queryFn: () => unwrap(api.GET('/api/campaigns/{campaignId}/characters', path(campaignId))),
  })
}

export function useSessions(campaignId: string) {
  return useQuery({
    queryKey: campaignKeys.sessions(campaignId),
    queryFn: () => unwrap(api.GET('/api/campaigns/{campaignId}/sessions', path(campaignId))),
  })
}

/** One session with its fights (for `dm` members; players get only the running one). */
export function useSession(campaignId: string, sessionId: string) {
  return useQuery({
    queryKey: campaignKeys.session(campaignId, sessionId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/sessions/{sessionId}', {
          params: { path: { campaignId, sessionId } },
        }),
      ),
  })
}

/** After any change to a session: the campaign with its sessions, and the landing page. */
export function useInvalidateSessions(campaignId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
      queryClient.invalidateQueries({ queryKey: campaignKeys.list }),
    ])
}
