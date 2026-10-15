// Queries for encounters and the board. Keys nest under the campaign (see
// campaigns/queries.ts), so invalidating ['campaign', id] refreshes these too.
//
// Nothing here polls: the server scales to zero between sessions
// (knowledge/decisions/hosting.md). The fight page keeps the board current over the
// table hub and reloads it after every (re)connect (table/connection.ts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CharacterPlacement, ImportMapRequest } from '../api/types'
import { campaignKeys } from '../campaigns/queries'

export const encounterKeys = {
  board: (campaignId: string, encounterId: string) =>
    ['campaign', campaignId, 'encounters', encounterId, 'board'] as const,
}

/**
 * Everything needed to draw an encounter. A player gets 404 once it has ended. Not
 * reloaded on focus: the table connection reloads it when the app is visible again.
 */
export function useBoard(campaignId: string, encounterId: string) {
  return useQuery({
    queryKey: encounterKeys.board(campaignId, encounterId),
    refetchOnWindowFocus: false,
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/encounters/{encounterId}/board', {
          params: { path: { campaignId, encounterId } },
        }),
      ),
  })
}

/**
 * After an import, start or end: the campaign with its sessions and their fights,
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

/** A map file or sample map as a new ready fight in the session. */
export function useImportMap(campaignId: string, sessionId: string) {
  const invalidate = useInvalidateFights(campaignId)
  return useMutation({
    mutationFn: (file: ImportMapRequest) =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/sessions/{sessionId}/encounters/import', {
          params: { path: { campaignId, sessionId } },
          body: file,
        }),
      ),
    // Not awaited: the caller navigates away at once.
    onSuccess: () => void invalidate(),
  })
}

export function useStartEncounter(campaignId: string, sessionId: string, encounterId: string) {
  const queryClient = useQueryClient()
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
    // The cached board is the setup screen's: ready, without the characters. Dropping
    // it makes the fight page load the started board instead of showing the old one.
    // The rest isn't awaited: the caller navigates away at once.
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: encounterKeys.board(campaignId, encounterId) })
      void invalidate()
    },
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
