// The campaign's creature types for the spawn picker (knowledge/features/creature-spawn.md).
// The fight page works online and outside the offline store, so the types come from the
// server through the bestiary's sync protocol (the DM's versions list and items), and a
// type made in the picker with only a name and a size goes up as a sync push (question 34);
// its icon and the rest follow in the bestiary. The next sync brings it into the browser.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatureSize, SyncPushRequest } from '../../api/types'
import { fetchItems, fetchVersions, pushItems } from '../../sync/api'
import type { SpawnType } from './draft'

export const spawnTypesKey = (campaignId: string) =>
  ['campaign', campaignId, 'spawn-creature-types'] as const

/** The campaign's creature types that aren't archived, by name. */
export async function fetchSpawnTypes(campaignId: string): Promise<SpawnType[]> {
  const versions = await fetchVersions(campaignId)
  const ids = versions.creatureTypes.map((version) => version.id)
  if (ids.length === 0) return []
  const items = await fetchItems(campaignId, ids)
  const types: SpawnType[] = []
  for (const item of items) {
    const data = item.creatureType
    if (item.kind === 'creatureType' && data && data.archivedAt === null) {
      types.push({ id: item.id, name: data.name, size: data.size })
    }
  }
  return types.sort((a, b) => a.name.localeCompare(b.name, 'de-DE', { numeric: true }))
}

/** The types, loaded when the picker opens (`enabled`), not on a timer. */
export function useSpawnTypes(campaignId: string, enabled: boolean) {
  return useQuery({
    queryKey: spawnTypesKey(campaignId),
    queryFn: () => fetchSpawnTypes(campaignId),
    enabled,
    staleTime: 0,
  })
}

/** What "Neue Art" can say: the id of the type (an existing one of that name is reused), or why not. */
export type CreateTypeResult =
  { ok: true; id: string } | { ok: false; reason: 'nameTaken' | 'failed' }

/** Makes a creature type with only a name and a size. */
export async function createSpawnType(
  campaignId: string,
  input: { name: string; size: CreatureSize },
  id: string = crypto.randomUUID(),
): Promise<CreateTypeResult> {
  const body: SyncPushRequest = {
    items: [
      {
        id,
        kind: 'creatureType',
        campaignId,
        baseVersion: 0,
        campaign: null,
        map: null,
        encounter: null,
        creatureType: {
          name: input.name.trim(),
          size: input.size,
          appearance: '',
          notes: '',
          archivedAt: null,
          initiativeModifier: 0,
          initiativeRollMode: 'normal',
        },
      },
    ],
  }
  try {
    const result = (await pushItems(body)).results[0]
    if (result?.outcome === 'created' || result?.outcome === 'saved') return { ok: true, id }
    // The name already exists in the campaign: that type is the one meant.
    if (result?.existingCreatureTypeId) return { ok: true, id: result.existingCreatureTypeId }
    const taken = result?.error?.code === 'creatureTypeNameTaken'
    return { ok: false, reason: taken ? 'nameTaken' : 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Reloads the picker's list after a type was made. */
export function useRefreshSpawnTypes(campaignId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: spawnTypesKey(campaignId) })
}
