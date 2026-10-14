// Other people's move previews (knowledge/decisions/realtime-sync.md, "Move previews"):
// where someone is about to move a token, shown as an arrow until they confirm or let go.
// One per person and token; the server sends them only to the others.
import type { BoardToken, MovePreviewClearedEvent, MovePreviewEvent } from '../api/types'
import type { MoveArrow } from '../board/render'

export type Previews = ReadonlyMap<string, MovePreviewEvent>

export const NO_PREVIEWS: Previews = new Map()

function previewKey(preview: Pick<MovePreviewEvent, 'byUserId' | 'tokenId'>): string {
  return `${preview.byUserId}:${preview.tokenId}`
}

/** Adds or replaces a preview; the newest is drawn last, so on top. */
export function withPreview(previews: Previews, preview: MovePreviewEvent): Previews {
  const next = new Map(previews)
  const key = previewKey(preview)
  next.delete(key)
  return next.set(key, preview)
}

export function withoutPreview(previews: Previews, cleared: MovePreviewClearedEvent): Previews {
  const key = previewKey(cleared)
  if (!previews.has(key)) return previews
  const next = new Map(previews)
  next.delete(key)
  return next
}

/** The arrows to draw: previews of tokens on the board that point somewhere else. */
export function moveArrows(previews: Previews, tokens: readonly BoardToken[]): MoveArrow[] {
  const arrows: MoveArrow[] = []
  for (const preview of previews.values()) {
    const token = tokens.find((candidate) => candidate.id === preview.tokenId)
    if (!token || (token.x === preview.x && token.y === preview.y)) continue
    arrows.push({ tokenId: token.id, x: preview.x, y: preview.y })
  }
  return arrows
}
