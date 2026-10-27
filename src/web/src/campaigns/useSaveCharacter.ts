import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { CharacterRequest } from '../api/types'
import { campaignKeys } from './queries'

/** Creates a character, or saves `characterId`, and refreshes the campaign's characters. */
export function useSaveCharacter(campaignId: string, characterId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CharacterRequest) =>
      unwrap(
        characterId
          ? api.PUT('/api/campaigns/{campaignId}/characters/{characterId}', {
              params: { path: { campaignId, characterId } },
              body,
            })
          : api.POST('/api/campaigns/{campaignId}/characters', {
              params: { path: { campaignId } },
              body,
            }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: campaignKeys.characters(campaignId) }),
  })
}
