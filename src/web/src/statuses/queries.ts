// Statuses and status lists from the server (knowledge/features/statuses.md,
// src/Server/Statuses/StatusEndpoints.cs): the campaign's statuses, a character's or the
// DM's own status list, the picker of a running fight, and the calls that change them.
// Everything needs a connection; callers ask only while online.
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CreateStatusRequest, StatusDefinition, StatusList } from '../api/types'

/** Whose status list: a character's, or the signed-in `dm` member's own. */
export type StatusListOwner = { kind: 'character'; characterId: string } | { kind: 'dm' }

export const statusKeys = {
  /** Everything about statuses in the campaign: invalidated after a new icon is picked. */
  campaign: (campaignId: string) => ['statuses', campaignId] as const,
  all: (campaignId: string) => ['statuses', campaignId, 'all'] as const,
  list: (campaignId: string, owner: StatusListOwner) =>
    owner.kind === 'dm'
      ? (['statuses', campaignId, 'dm-list'] as const)
      : (['statuses', campaignId, 'character-list', owner.characterId] as const),
  picker: (campaignId: string, encounterId: string) =>
    ['statuses', campaignId, 'picker', encounterId] as const,
}

/** Every status the campaign can put in a list: the 15 conditions, then its own. */
export function useCampaignStatuses(campaignId: string, enabled: boolean) {
  return useQuery({
    queryKey: statusKeys.all(campaignId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/statuses', {
          params: { path: { campaignId } },
        }),
      ),
    enabled,
  })
}

export function fetchStatusList(campaignId: string, owner: StatusListOwner): Promise<StatusList> {
  return owner.kind === 'dm'
    ? unwrap(
        api.GET('/api/campaigns/{campaignId}/dm-status-list', {
          params: { path: { campaignId } },
        }),
      )
    : unwrap(
        api.GET('/api/campaigns/{campaignId}/characters/{characterId}/status-list', {
          params: { path: { campaignId, characterId: owner.characterId } },
        }),
      )
}

export function useStatusList(campaignId: string, owner: StatusListOwner, enabled: boolean) {
  return useQuery({
    queryKey: statusKeys.list(campaignId, owner),
    queryFn: () => fetchStatusList(campaignId, owner),
    enabled,
  })
}

/** Saves the whole list in its new order. */
export function saveStatusList(
  campaignId: string,
  owner: StatusListOwner,
  statusIds: string[],
): Promise<StatusList> {
  return owner.kind === 'dm'
    ? unwrap(
        api.PUT('/api/campaigns/{campaignId}/dm-status-list', {
          params: { path: { campaignId } },
          body: { statusIds },
        }),
      )
    : unwrap(
        api.PUT('/api/campaigns/{campaignId}/characters/{characterId}/status-list', {
          params: { path: { campaignId, characterId: owner.characterId } },
          body: { statusIds },
        }),
      )
}

/** A custom status, added at the end of the list it is made in. */
export function createStatus(
  campaignId: string,
  body: CreateStatusRequest,
): Promise<StatusDefinition> {
  return unwrap(
    api.POST('/api/campaigns/{campaignId}/statuses', {
      params: { path: { campaignId } },
      body,
    }),
  )
}

/** The picker of a running fight; asked for again every time it opens. */
export function useStatusPicker(campaignId: string, encounterId: string) {
  return useQuery({
    queryKey: statusKeys.picker(campaignId, encounterId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/encounters/{encounterId}/status-picker', {
          params: { path: { campaignId, encounterId } },
        }),
      ),
    refetchOnMount: 'always',
  })
}

/** The list's ids with one moved up (-1) or down (+1); the same list at an end. */
export function moveInList(ids: readonly string[], index: number, by: -1 | 1): string[] {
  const to = index + by
  if (to < 0 || to >= ids.length) return [...ids]
  const next = [...ids]
  ;[next[index], next[to]] = [next[to]!, next[index]!]
  return next
}
