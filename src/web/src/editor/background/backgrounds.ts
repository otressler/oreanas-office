// The map's background versions from the server (knowledge/features/ai-map-generation.md):
// one TanStack query shared by the "Hintergrund" panel and the preview, the two calls that
// change them, and the pure rules on top (pending jobs, what fits the map, the budget).
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '../../api/client'
import { ApiRequestError, isApiErrorCode, unwrap } from '../../api/errors'
import type {
  BackgroundPlacement,
  BoardBackground,
  ImageBudget,
  MapBackground,
  MapBackgrounds,
} from '../../api/types'
import { useLocalUser } from '../../offline/localUser'
import { useOnline } from '../encounter/useOnline'

export const backgroundsKey = (campaignId: string, mapId: string) =>
  ['map-backgrounds', campaignId, mapId] as const

export function fetchBackgrounds(campaignId: string, mapId: string): Promise<MapBackgrounds> {
  return unwrap(
    api.GET('/api/campaigns/{campaignId}/maps/{mapId}/backgrounds', {
      params: { path: { campaignId, mapId } },
    }),
  )
}

/** What a refinement edits and how: a done version that fits the map, and the DM's words. */
export interface Refinement {
  assetId: string
  instruction: string
}

/**
 * Queues a job; only after the DM confirmed it and the map was synced. With `refine`, a new
 * version from a finished one and an instruction instead of a fresh picture.
 */
export function generateBackground(
  campaignId: string,
  mapId: string,
  mapVersion: number,
  refine?: Refinement,
): Promise<MapBackground> {
  return unwrap(
    api.POST('/api/campaigns/{campaignId}/maps/{mapId}/backgrounds', {
      params: { path: { campaignId, mapId } },
      body: refine
        ? { mapVersion, refineAssetId: refine.assetId, instruction: refine.instruction }
        : { mapVersion },
    }),
  )
}

/**
 * Uploads the DM's own picture (PNG, WebP or JPEG) as a new version, which the server picks
 * at once: the raw body with its type, not a form, like portrait uploads.
 */
export async function uploadBackground(
  campaignId: string,
  mapId: string,
  picture: Blob,
): Promise<MapBackground> {
  const base = globalThis.location?.origin ?? ''
  const response = await globalThis.fetch(
    `${base}/api/campaigns/${encodeURIComponent(campaignId)}/maps/${encodeURIComponent(mapId)}/backgrounds/upload`,
    {
      method: 'POST',
      body: picture,
      headers: { 'Content-Type': picture.type || 'application/octet-stream' },
      credentials: 'same-origin',
    },
  )
  const json = response.headers.get('Content-Type')?.includes('json')
    ? ((await response.json()) as unknown)
    : undefined
  if (response.ok) return json as MapBackground
  const body = json as { code?: unknown; field?: unknown } | undefined
  throw new ApiRequestError(
    response.status,
    isApiErrorCode(body?.code) ? body.code : null,
    typeof body?.field === 'string' ? body.field : null,
  )
}

/** The picture types an upload may have. */
export const UPLOAD_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const

/** Picks a done version that fits the map, or (null) none: the plain rendering. */
export async function pickBackground(
  campaignId: string,
  mapId: string,
  assetId: string | null,
): Promise<void> {
  await unwrap(
    api.PUT('/api/campaigns/{campaignId}/maps/{mapId}/background', {
      params: { path: { campaignId, mapId } },
      body: { assetId },
    }),
  )
}

export interface MapBackgroundsState {
  /** Online and the server has the map: the list can be asked for. */
  enabled: boolean
  /** The server has never seen the map (its sync version is 0); generating syncs it first. */
  notSynced: boolean
  online: boolean
  query: ReturnType<typeof useBackgroundsQuery>
}

function useBackgroundsQuery(campaignId: string, mapId: string, enabled: boolean) {
  return useQuery({
    queryKey: backgroundsKey(campaignId, mapId),
    queryFn: () => fetchBackgrounds(campaignId, mapId),
    enabled,
  })
}

/**
 * The map's versions while online and once the server has the map. Offline, or for a map
 * only on this device, nothing is asked for (the server would answer 404).
 */
export function useMapBackgrounds(campaignId: string, mapId: string): MapBackgroundsState {
  const { db } = useLocalUser()
  const online = useOnline()
  const baseVersion = useLiveQuery(
    async () => (await db.maps.get(mapId))?.sync.baseVersion ?? null,
    [db, mapId],
  )
  // A map the device doesn't hold (undefined while reading) is the server's already.
  const notSynced = baseVersion === 0
  const enabled = online && baseVersion !== undefined && !notSynced
  const query = useBackgroundsQuery(campaignId, mapId, enabled)
  return { enabled, notSynced, online, query }
}

// ---- Rules --------------------------------------------------------------------------------

/** A job of the map is waiting or being painted: the image hub is needed. */
export function hasPendingJob(versions: readonly MapBackground[]): boolean {
  return versions.some((v) => v.status === 'queued' || v.status === 'running')
}

/** The map's size in the editor right now. */
export interface MapSize {
  width: number
  height: number
}

/**
 * Made for another size than the map has: the server says so for its copy, and the editor
 * also checks the size on this device, so a resize shows at once and undoing it brings the
 * image back.
 */
export function isOutdated(version: MapBackground, size: MapSize): boolean {
  // Uploads fit every size: the DM places them by hand.
  if (version.origin === 'uploaded') return false
  return version.outdated || version.gridWidth !== size.width || version.gridHeight !== size.height
}

/** A done version that fits the map: it can be picked. */
export function canPick(version: MapBackground, size: MapSize): boolean {
  return version.status === 'done' && version.url !== null && !isOutdated(version, size)
}

/** The picked version, when the list has it. */
export function pickedVersion(data: MapBackgrounds | undefined): MapBackground | null {
  if (!data?.pickedAssetId) return null
  return data.versions.find((v) => v.id === data.pickedAssetId) ?? null
}

/** The picked version while the board can show it: done and fitting the map. */
export function shownVersion(
  data: MapBackgrounds | undefined,
  size: MapSize,
): MapBackground | null {
  const picked = pickedVersion(data)
  return picked && canPick(picked, size) ? picked : null
}

/**
 * Where a version lies: the DM's placement while it was made for this version, else the
 * version's own frame, unturned.
 */
export function placementFor(
  version: Pick<MapBackground, 'id' | 'x' | 'y' | 'width' | 'height'>,
  placement: BackgroundPlacement | null | undefined,
): BackgroundPlacement {
  if (placement && placement.assetId === version.id) return placement
  const { x, y, width, height } = version
  return { assetId: version.id, x, y, width, height, rotation: 0 }
}

/** What the board draws for the picked version, or null for the plain rendering. */
export function pickedBoardBackground(
  data: MapBackgrounds | undefined,
  size: MapSize,
  placement: BackgroundPlacement | null = null,
): BoardBackground | null {
  const picked = shownVersion(data, size)
  if (!picked) return null
  const { x, y, width, height, rotation } = placementFor(picked, placement)
  return { assetId: picked.id, url: picked.url!, x, y, width, height, rotation }
}

/** The list with one version replaced (or added, newest first) after a hub message. */
export function withVersion(data: MapBackgrounds, version: MapBackground): MapBackgrounds {
  const known = data.versions.some((v) => v.id === version.id)
  const versions = known
    ? data.versions.map((v) => (v.id === version.id ? version : v))
    : [version, ...data.versions]
  return {
    ...data,
    versions: [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}

/** Why no job can be started right now, or null when the budget allows one. */
export function budgetBlock(budget: ImageBudget | undefined): 'unavailable' | 'exhausted' | null {
  if (!budget) return null
  if (!budget.available) return 'unavailable'
  if (budget.spentUsd >= budget.limitUsd) return 'exhausted'
  return null
}

const usd = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' })

/** Dollars in German format, e.g. "0,42 $". */
export function formatUsd(amount: number): string {
  return usd.format(amount)
}
