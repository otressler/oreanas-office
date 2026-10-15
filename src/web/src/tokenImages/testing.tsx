// Test helpers for icons and portraits: versions as the server sends them, and a gallery
// list.
import type { TokenImage, TokenImages } from '../api/types'
import { budget } from '../editor/background/testing'

let count = 0

/** A version of character ch1's portrait, done unless the fields say otherwise. */
export function tokenImage(fields: Partial<TokenImage> = {}): TokenImage {
  count += 1
  const id = fields.id ?? `10000000-0000-0000-0000-${String(count).padStart(12, '0')}`
  const status = fields.status ?? 'done'
  return {
    id,
    ownerType: 'character',
    ownerId: 'ch1',
    origin: 'generated',
    status,
    url: status === 'done' ? `/api/assets/${id}` : null,
    failure: null,
    sourceAssetId: null,
    createdAt: `2026-10-15T08:${String(10 + (count % 50)).padStart(2, '0')}:00Z`,
    finishedAt: status === 'done' ? '2026-10-15T08:30:40Z' : null,
    ...fields,
  }
}

export const tokenImagesOf = (
  versions: TokenImage[],
  fields: Partial<TokenImages> = {},
): TokenImages => ({ pickedAssetId: null, versions, budget: budget(), ...fields })
