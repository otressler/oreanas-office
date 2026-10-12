// Queries for encounters and the board. Keys nest under the campaign (see
// campaigns/queries.ts), so invalidating ['campaign', id] refreshes these too.
//
// Nothing here polls: the server scales to zero between sessions
// (knowledge/decisions/hosting.md). The board reloads on focus and reconnect;
// live updates arrive in stage 4.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CharacterPlacement, ImportMapRequest } from '../api/types'
import { campaignKeys } from '../campaigns/queries'

export const encounterKeys = {
  list: (campaignId: string) => ['campaign', campaignId, 'encounters'] as const,
  board: (campaignId: string, encounterId: string) =>
    ['campaign', campaignId, 'encounters', encounterId, 'board'] as const,
}

/** The campaign's encounters; `dm` members only. */
export function useEncounters(campaignId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: encounterKeys.list(campaignId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/encounters', {
          params: { path: { campaignId } },
        }),
      ),
    enabled,
  })
}

/** Everything needed to draw an encounter. A player gets 404 once it has ended. */
export function useBoard(campaignId: string, encounterId: string) {
  return useQuery({
    queryKey: encounterKeys.board(campaignId, encounterId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/encounters/{encounterId}/board', {
          params: { path: { campaignId, encounterId } },
        }),
      ),
  })
}

/**
 * After an import, start or end: the campaign with its sessions and encounters,
 * and the landing page's active sessions.
 */
function useInvalidateFights(campaignId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
      queryClient.invalidateQueries({ queryKey: campaignKeys.list }),
    ])
}

export function useImportMap(campaignId: string) {
  const invalidate = useInvalidateFights(campaignId)
  return useMutation({
    mutationFn: (file: ImportMapRequest) =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/encounters/import', {
          params: { path: { campaignId } },
          body: file,
        }),
      ),
    // Not awaited: the caller navigates away at once.
    onSuccess: () => void invalidate(),
  })
}

export function useStartEncounter(campaignId: string, sessionId: string, encounterId: string) {
  const invalidate = useInvalidateFights(campaignId)
  return useMutation({
    mutationFn: (characters: CharacterPlacement[]) =>
      unwrap(
        api.POST(
          '/api/campaigns/{campaignId}/sessions/{sessionId}/encounters/{encounterId}/start',
          {
            params: { path: { campaignId, sessionId, encounterId } },
            body: { characters },
          },
        ),
      ),
    // Not awaited: the caller navigates away at once.
    onSuccess: () => void invalidate(),
  })
}

export function useEndEncounter(campaignId: string, sessionId: string, encounterId: string) {
  const invalidate = useInvalidateFights(campaignId)
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/sessions/{sessionId}/encounters/{encounterId}/end', {
          params: { path: { campaignId, sessionId, encounterId } },
        }),
      ),
    // Not awaited: the caller navigates away at once.
    onSuccess: () => void invalidate(),
  })
}
