// Queries of the spectator screen and the join page. Spectators may not read the campaign's
// own endpoints, so the screen reads the session's: /api/sessions/{sessionId}/spectate.
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { encounterKeys } from '../encounters/queries'

/**
 * Where the spectator screen keeps its board in the query cache. The screen's board is always
 * the players' view, so it must not share a cache entry with the fight page's board (which is
 * the session DM's own for a DM). useTable takes this in place of the campaign id, which it
 * uses for nothing but the cache key.
 */
export const spectatorScope = (sessionId: string) => `spectate-${sessionId}`

export function fetchWatchedSession(sessionId: string) {
  return unwrap(api.GET('/api/sessions/{sessionId}/spectate', { params: { path: { sessionId } } }))
}

/**
 * The players' board of the session's running fight, kept current by useTable. Not reloaded on
 * focus: the table connection reloads it when the app is visible again. A shared screen (local
 * mode, a member's device) asks the campaign's board endpoint for the players' view with
 * `sharedScreen`, which gives it the undo of moves made from a shared screen.
 */
export function useWatchedBoard(
  session: { sessionId: string; campaignId: string },
  encounterId: string | null,
  sharedScreen: boolean,
) {
  return useQuery({
    enabled: encounterId !== null,
    queryKey: encounterKeys.board(spectatorScope(session.sessionId), encounterId ?? ''),
    refetchOnWindowFocus: false,
    queryFn: () =>
      unwrap(
        sharedScreen && encounterId
          ? api.GET('/api/campaigns/{campaignId}/encounters/{encounterId}/board', {
              params: {
                path: { campaignId: session.campaignId, encounterId },
                query: { view: 'player', sharedScreen: true },
              },
            })
          : api.GET('/api/sessions/{sessionId}/spectate/board', {
              params: { path: { sessionId: session.sessionId } },
            }),
      ),
  })
}

/** What a join code leads to, without joining. */
export function useJoinLookup(joinCode: string) {
  return useQuery({
    queryKey: ['join', joinCode],
    staleTime: 0,
    queryFn: () => unwrap(api.GET('/api/join/{joinCode}', { params: { path: { joinCode } } })),
  })
}

/** "Nur zuschauen": a session spectator entry (members just get the answer). */
export function useJoinAsSpectator(joinCode: string) {
  return useMutation({
    mutationFn: (sessionId: string) =>
      unwrap(
        api.POST('/api/join/{joinCode}/spectate', {
          params: { path: { joinCode } },
          body: { sessionId },
        }),
      ),
  })
}
