// Icons of creature types and portraits of characters from the server
// (knowledge/features/token-icons.md): one TanStack query per owner, the calls that change
// them, the campaign's icon list for the bestiary, and the pure rules on top. Everything
// here needs a connection; callers ask only while online.
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { ApiRequestError, isApiErrorCode, unwrap } from '../api/errors'
import type {
  CreatureTypeIcon,
  GenerateTokenImageRequest,
  TokenImage,
  TokenImageOwnerType,
  TokenImages,
} from '../api/types'
import { campaignKeys } from '../campaigns/queries'
import { useOnline } from '../editor/encounter/useOnline'

/** Whose icon or portrait: a creature type's or a character's. */
export interface TokenImageOwner {
  type: TokenImageOwnerType
  id: string
}

export const tokenImagesKey = (campaignId: string, owner: TokenImageOwner) =>
  ['token-images', campaignId, owner.type, owner.id] as const

export const creatureIconsKey = (campaignId: string) => ['creature-icons', campaignId] as const

/** What else shows the owner's picked image and must be asked for again after a pick. */
export function pickedImageKeys(campaignId: string, owner: TokenImageOwner) {
  return owner.type === 'character'
    ? [campaignKeys.characters(campaignId)]
    : [creatureIconsKey(campaignId)]
}

export function fetchTokenImages(campaignId: string, owner: TokenImageOwner): Promise<TokenImages> {
  return owner.type === 'character'
    ? unwrap(
        api.GET('/api/campaigns/{campaignId}/characters/{characterId}/portraits', {
          params: { path: { campaignId, characterId: owner.id } },
        }),
      )
    : unwrap(
        api.GET('/api/campaigns/{campaignId}/creature-types/{creatureTypeId}/icons', {
          params: { path: { campaignId, creatureTypeId: owner.id } },
        }),
      )
}

/**
 * Queues a job, only after a person confirmed it. Creature types send the version they
 * were synced at (`itemVersion`); characters may name an uploaded version to restyle.
 */
export function generateTokenImage(
  campaignId: string,
  owner: TokenImageOwner,
  body: GenerateTokenImageRequest,
): Promise<TokenImage> {
  return owner.type === 'character'
    ? unwrap(
        api.POST('/api/campaigns/{campaignId}/characters/{characterId}/portraits', {
          params: { path: { campaignId, characterId: owner.id } },
          body,
        }),
      )
    : unwrap(
        api.POST('/api/campaigns/{campaignId}/creature-types/{creatureTypeId}/icons', {
          params: { path: { campaignId, creatureTypeId: owner.id } },
          body,
        }),
      )
}

/** Picks a done version, or (null) none: the token shows its letter. */
export async function pickTokenImage(
  campaignId: string,
  owner: TokenImageOwner,
  assetId: string | null,
): Promise<void> {
  await (owner.type === 'character'
    ? unwrap(
        api.PUT('/api/campaigns/{campaignId}/characters/{characterId}/portrait', {
          params: { path: { campaignId, characterId: owner.id } },
          body: { assetId },
        }),
      )
    : unwrap(
        api.PUT('/api/campaigns/{campaignId}/creature-types/{creatureTypeId}/icon', {
          params: { path: { campaignId, creatureTypeId: owner.id } },
          body: { assetId },
        }),
      ))
}

/**
 * Uploads a picture as the character's portrait: the raw body with its type, not a form.
 * The server answers with the new version, already done and picked.
 */
export async function uploadPortrait(
  campaignId: string,
  characterId: string,
  picture: Blob,
): Promise<TokenImage> {
  const base = globalThis.location?.origin ?? ''
  const response = await globalThis.fetch(
    `${base}/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}/portraits/upload`,
    {
      method: 'POST',
      body: picture,
      headers: { 'Content-Type': picture.type || 'image/jpeg' },
      credentials: 'same-origin',
    },
  )
  const json = response.headers.get('Content-Type')?.includes('json')
    ? ((await response.json()) as unknown)
    : undefined
  if (response.ok) return json as TokenImage
  const body = json as { code?: unknown; field?: unknown } | undefined
  throw new ApiRequestError(
    response.status,
    isApiErrorCode(body?.code) ? body.code : null,
    typeof body?.field === 'string' ? body.field : null,
  )
}

/** The owner's versions while `enabled` (online, and the server knows the owner). */
export function useTokenImages(campaignId: string, owner: TokenImageOwner, enabled: boolean) {
  return useQuery({
    queryKey: tokenImagesKey(campaignId, owner),
    queryFn: () => fetchTokenImages(campaignId, owner),
    enabled,
  })
}

/**
 * The picked icon of every creature type of the campaign, by type id, while online; an
 * empty map offline, while loading, or when the server doesn't know the campaign yet.
 */
export function useCreatureIcons(campaignId: string): ReadonlyMap<string, CreatureTypeIcon> {
  const online = useOnline()
  const query = useQuery({
    queryKey: creatureIconsKey(campaignId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/creature-types/icons', {
          params: { path: { campaignId } },
        }),
      ),
    enabled: online,
    select: iconsByType,
  })
  return (online && query.data) || NO_ICONS
}

const NO_ICONS: ReadonlyMap<string, CreatureTypeIcon> = new Map()

function iconsByType(icons: CreatureTypeIcon[]): ReadonlyMap<string, CreatureTypeIcon> {
  return new Map(icons.map((icon) => [icon.creatureTypeId, icon]))
}

// ---- Rules --------------------------------------------------------------------------------

/** A job of the owner is waiting or being painted: the image hub is needed. */
export function hasPendingImage(versions: readonly TokenImage[]): boolean {
  return versions.some((v) => v.status === 'queued' || v.status === 'running')
}

/** A done version with a picture: it can be picked. */
export function canPickImage(version: TokenImage): boolean {
  return version.status === 'done' && version.url !== null
}

/** The picked version, when the list has it. */
export function pickedImage(data: TokenImages | undefined): TokenImage | null {
  if (!data?.pickedAssetId) return null
  return data.versions.find((v) => v.id === data.pickedAssetId) ?? null
}

/** The list with one version replaced (or added, newest first) after a hub message. */
export function withImage(data: TokenImages, image: TokenImage): TokenImages {
  const known = data.versions.some((v) => v.id === image.id)
  const versions = known
    ? data.versions.map((v) => (v.id === image.id ? image : v))
    : [image, ...data.versions]
  return {
    ...data,
    versions: [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}

/** How a version came about: painted, uploaded, or an upload painted in the token style. */
export function imageKind(version: TokenImage): 'generated' | 'uploaded' | 'restyled' {
  if (version.origin === 'uploaded') return 'uploaded'
  return version.sourceAssetId ? 'restyled' : 'generated'
}
