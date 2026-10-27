import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { campaignKeys } from './queries'

/**
 * Copies one of the viewer's characters from another campaign into this one
 * (knowledge/features/character-import.md), and refreshes the campaign and home's list,
 * whose cards show the characters.
 */
export function useImportCharacter(campaignId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (characterId: string) =>
      unwrap(
        api.POST('/api/campaigns/{campaignId}/characters/import', {
          params: { path: { campaignId } },
          body: { characterId },
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
        queryClient.invalidateQueries({ queryKey: campaignKeys.list }),
      ]),
  })
}
