import { describe, expect, it } from 'vitest'
import type { BoardToken, MovePreviewEvent } from '../api/types'
import { NO_PREVIEWS, moveArrows, withPreview, withoutPreview } from './previews'

const preview = (fields: Partial<MovePreviewEvent>): MovePreviewEvent => ({
  encounterId: 'e1',
  tokenId: 't1',
  x: 2,
  y: 1,
  byUserId: 'u1',
  ...fields,
})

const tokens = [
  { id: 't1', x: 0, y: 0 },
  { id: 't2', x: 3, y: 3 },
] as BoardToken[]

describe('move previews', () => {
  it('keeps one per person and token, the newest last', () => {
    let previews = withPreview(NO_PREVIEWS, preview({}))
    previews = withPreview(previews, preview({ tokenId: 't2', x: 1 }))
    previews = withPreview(previews, preview({ x: 3 }))
    previews = withPreview(previews, preview({ byUserId: 'u2', x: 1 }))

    expect(moveArrows(previews, tokens)).toEqual([
      { tokenId: 't2', x: 1, y: 1 },
      { tokenId: 't1', x: 3, y: 1 },
      { tokenId: 't1', x: 1, y: 1 },
    ])
  })

  it('takes back only the preview of that person and token', () => {
    const previews = withPreview(withPreview(NO_PREVIEWS, preview({})), preview({ byUserId: 'u2' }))

    const after = withoutPreview(previews, { encounterId: 'e1', tokenId: 't1', byUserId: 'u1' })

    expect([...after.values()].map((p) => p.byUserId)).toEqual(['u2'])
    expect(withoutPreview(after, { encounterId: 'e1', tokenId: 't9', byUserId: 'u1' })).toBe(after)
  })

  it('draws no arrow for a token that is gone or already there', () => {
    let previews = withPreview(NO_PREVIEWS, preview({ tokenId: 'gone' }))
    previews = withPreview(previews, preview({ tokenId: 't2', x: 3, y: 3 }))

    expect(moveArrows(previews, tokens)).toEqual([])
  })
})
