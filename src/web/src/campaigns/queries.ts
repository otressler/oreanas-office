// Queries for campaigns and what hangs off them. Keys nest under the campaign,
// so invalidating ['campaign', id] refreshes its members, characters and sessions.
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'

export const campaignKeys = {
  list: ['campaigns'] as const,
  detail: (campaignId: string) => ['campaign', campaignId] as const,
  characters: (campaignId: string) => ['campaign', campaignId, 'characters'] as const,
  sessions: (campaignId: string) => ['campaign', campaignId, 'sessions'] as const,
}

const path = (campaignId: string) => ({ params: { path: { campaignId } } })

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.list,
    queryFn: () => unwrap(api.GET('/api/campaigns')),
  })
}

export function useCampaign(campaignId: string) {
  return useQuery({
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
