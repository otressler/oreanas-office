// Requests for spell cards (knowledge/features/spell-cards.md). The library is site-wide, so
// its keys don't hang off a campaign; a character's spells hang off the campaign's
// characters, so a change to them refreshes the character page too.
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { ApiRequestError, isApiErrorCode, unwrap } from '../api/errors'
import type {
  CharacterSpell,
  SpellArtImage,
  SpellCard,
  SpellDraft,
  SpellJobsRequest,
  SpellVariant,
  SpellVariantOrigin,
} from '../api/types'

export const spellKeys = {
  all: ['spells'] as const,
  library: ['spells', 'library'] as const,
  spell: (spellId: string) => ['spells', 'spell', spellId] as const,
  variant: (variantId: string) => ['spells', 'variant', variantId] as const,
  studio: (variantId: string) => ['spells', 'studio', variantId] as const,
  importStatus: ['spells', 'import'] as const,
  jobs: ['spells', 'jobs'] as const,
  character: (campaignId: string, characterId: string) =>
    ['campaign', campaignId, 'characters', characterId, 'spells'] as const,
  campaign: (campaignId: string) => ['campaign', campaignId, 'characters', 'spells'] as const,
}

export function useSpellLibrary() {
  return useQuery({ queryKey: spellKeys.library, queryFn: () => unwrap(api.GET('/api/spells')) })
}

export function useSpell(spellId: string) {
  return useQuery({
    queryKey: spellKeys.spell(spellId),
    queryFn: () => unwrap(api.GET('/api/spells/{spellId}', { params: { path: { spellId } } })),
  })
}

export function useVariant(variantId: string | null) {
  return useQuery({
    enabled: !!variantId,
    queryKey: spellKeys.variant(variantId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/api/spells/variants/{variantId}', {
          params: { path: { variantId: variantId! } },
        }),
      ),
  })
}

export function useSpellImportStatus() {
  return useQuery({
    queryKey: spellKeys.importStatus,
    queryFn: () => unwrap(api.GET('/api/spells/import')),
  })
}

export function useCharacterSpells(campaignId: string, characterId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!characterId,
    queryKey: spellKeys.character(campaignId, characterId),
    queryFn: () =>
      unwrap(
        api.GET('/api/campaigns/{campaignId}/characters/{characterId}/spells', {
          params: { path: { campaignId, characterId } },
        }),
      ),
  })
}

/** Every character's spells in the campaign, for the gallery at the table. */
export function useCampaignSpells(campaignId: string, enabled = true) {
  return useQuery({
    enabled: enabled && !!campaignId,
    queryKey: spellKeys.campaign(campaignId),
    queryFn: async () =>
      (await unwrap(
        api.GET('/api/campaigns/{campaignId}/character-spells', {
          params: { path: { campaignId } },
        }),
      )) as Record<string, CharacterSpell[]>,
  })
}

/** A new card for a Handbook spell of the library. */
export interface NewVariant {
  spellId: string
  card: SpellCard
  origin: SpellVariantOrigin
  basedOnVariantId?: string | null
  /** The card draft it was checked from: the variant gets its motif, the draft goes. */
  draftId?: string | null
}

export const createVariant = (variant: NewVariant): Promise<SpellVariant> =>
  unwrap(api.POST('/api/spells/variants', { body: variant }))

export const updateVariant = (variantId: string, card: SpellCard): Promise<SpellVariant> =>
  unwrap(
    api.PUT('/api/spells/variants/{variantId}', {
      params: { path: { variantId } },
      body: { card },
    }),
  )

export const deleteVariant = (variantId: string) =>
  unwrap(api.DELETE('/api/spells/variants/{variantId}', { params: { path: { variantId } } }))

export const setCharacterSpell = (
  campaignId: string,
  characterId: string,
  spellId: string,
  variantId: string,
  prepared?: boolean,
): Promise<CharacterSpell> =>
  unwrap(
    api.PUT('/api/campaigns/{campaignId}/characters/{characterId}/spells/{spellId}', {
      params: { path: { campaignId, characterId, spellId } },
      body: { variantId, prepared: prepared ?? null },
    }),
  )

export const removeCharacterSpell = (campaignId: string, characterId: string, spellId: string) =>
  unwrap(
    api.DELETE('/api/campaigns/{campaignId}/characters/{characterId}/spells/{spellId}', {
      params: { path: { campaignId, characterId, spellId } },
    }),
  )

/** What the spell offers the character's status list (empty when nothing is missing). */
export const statusOffers = (campaignId: string, characterId: string, spellId: string) =>
  unwrap(
    api.GET('/api/campaigns/{campaignId}/characters/{characterId}/spells/{spellId}/status-offers', {
      params: { path: { campaignId, characterId, spellId } },
    }),
  )

/** Adds the picked offers, by key, to the character's status list; answers the list. */
export const addSpellStatuses = (
  campaignId: string,
  characterId: string,
  spellId: string,
  keys: string[],
) =>
  unwrap(
    api.POST('/api/campaigns/{campaignId}/characters/{characterId}/spells/{spellId}/statuses', {
      params: { path: { campaignId, characterId, spellId } },
      body: { keys },
    }),
  )

/** An admin discards a spell's card draft. */
export const discardDraft = (draftId: string) =>
  unwrap(api.DELETE('/api/spells/drafts/{draftId}', { params: { path: { draftId } } }))

/** The suggestion queue on the admin page; reloads every few seconds while jobs are open. */
export function useSpellJobs() {
  return useQuery({
    queryKey: spellKeys.jobs,
    queryFn: () => unwrap(api.GET('/api/admin/spells/jobs')),
    refetchInterval: (query) =>
      query.state.data?.counts.some((c) => c.queued + c.running > 0) ? 3000 : false,
  })
}

export const planSpellJobs = (request: SpellJobsRequest) =>
  unwrap(api.POST('/api/admin/spells/jobs/plan', { body: request }))

export const startSpellJobs = (request: SpellJobsRequest) =>
  unwrap(api.POST('/api/admin/spells/jobs', { body: request }))

export const retrySpellJob = (jobId: string) =>
  unwrap(api.POST('/api/admin/spells/jobs/{jobId}/retry', { params: { path: { jobId } } }))

export const retrySpellJobs = () => unwrap(api.POST('/api/admin/spells/jobs/retry'))

export const revertRevision = (revisionId: string) =>
  unwrap(
    api.POST('/api/admin/spells/revisions/{revisionId}/revert', {
      params: { path: { revisionId } },
    }),
  )

export const importByName = (name: string, force = false) =>
  unwrap(api.POST('/api/spells/import/name', { body: { name, force } }))

export async function importByPhoto(photo: Blob): Promise<SpellDraft[]> {
  const result = await postRaw<{ drafts: SpellDraft[] }>('/api/spells/import/photo', photo)
  return result.drafts
}

export const uploadSpellArt = (variantId: string, picture: Blob, letter: string | null) =>
  postRaw<SpellArtImage>(
    `/api/spells/variants/${encodeURIComponent(variantId)}/studio/upload${letter ? `?letter=${letter}` : ''}`,
    picture,
  )

/**
 * The picture's type from its first bytes: a file's name can lie (the spell-cards app keeps
 * JPEG data in some .png files), and the server checks the bytes against the type.
 */
export async function pictureType(picture: Blob): Promise<string> {
  const head = new Uint8Array(await picture.slice(0, 12).arrayBuffer())
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return 'image/png'
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg'
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return picture.type || 'image/jpeg'
}

/** A picture as the raw body with its type, not a form, as the server expects it. */
async function postRaw<T>(path: string, body: Blob): Promise<T> {
  const base = globalThis.location?.origin ?? ''
  const response = await globalThis.fetch(`${base}${path}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': await pictureType(body) },
    credentials: 'same-origin',
  })
  const json = response.headers.get('Content-Type')?.includes('json')
    ? ((await response.json()) as unknown)
    : undefined
  if (response.ok) return json as T
  const error = json as { code?: unknown; field?: unknown } | undefined
  throw new ApiRequestError(
    response.status,
    isApiErrorCode(error?.code) ? error.code : null,
    typeof error?.field === 'string' ? error.field : null,
  )
}

/**
 * A photo the right way up and at most `maxEdge` on its long edge, as JPEG: phone photos are
 * large, and the server only needs enough to read the text.
 */
export async function shrinkPhoto(file: Blob, maxEdge = 2048): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.88),
  )
}

/** An empty card for "Von Hand". */
export const blankCard = (): SpellCard => ({
  name: '',
  castingTime: '1 Aktion',
  range: '',
  components: 'V, G',
  duration: 'Unmittelbar',
  concentration: false,
  ritual: false,
  description: '',
  effects: [],
  icon: 'spark',
  pips: [],
  higherLevels: '',
  tip: '',
  material: '',
  source: '',
  writeIns: [],
})
