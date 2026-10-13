import { describe, expect, it } from 'vitest'
import type { TokenMovedEvent } from '../api/types'
import { ids, smallBoard } from '../encounters/testing'
import { applyMove, mergeKnown, rememberMove, withPending, type KnownPositions } from './merge'

const board = smallBoard({ status: 'active' })

function moved(fields: Partial<TokenMovedEvent> = {}): TokenMovedEvent {
  return {
    encounterId: ids.encounter,
    tokenId: 't1',
    x: 1,
    y: 1,
    elevation: 0,
    version: 1,
    byUserId: 'u2',
    undo: false,
    ...fields,
  }
}

describe('applyMove', () => {
  it('moves the token when the event is newer', () => {
    const next = applyMove(board, moved({ x: 0, y: 1, elevation: 1.5, version: 3 }))
    expect(next.tokens[0]).toMatchObject({ x: 0, y: 1, elevation: 1.5, version: 3 })
    expect(board.tokens[0]).toMatchObject({ x: 3, y: 0, version: 0 })
  })

  it('keeps the board when the event is as old or older than the token', () => {
    const at2 = applyMove(board, moved({ version: 2 }))
    expect(applyMove(at2, moved({ x: 0, version: 2 }))).toBe(at2)
    expect(applyMove(at2, moved({ x: 0, version: 1 }))).toBe(at2)
  })

  it('ignores unknown tokens and other encounters', () => {
    expect(applyMove(board, moved({ tokenId: 'nope' }))).toBe(board)
    expect(applyMove(board, moved({ encounterId: 'other' }))).toBe(board)
  })
})

describe('rememberMove', () => {
  it('keeps the highest version per token', () => {
    let known: KnownPositions = new Map()
    known = rememberMove(known, moved({ x: 2, version: 2 }))
    const same = rememberMove(known, moved({ x: 0, version: 1 }))
    expect(same).toBe(known)
    expect(known.get('t1')).toEqual({ x: 2, y: 1, elevation: 0, version: 2 })
    expect(rememberMove(known, moved({ x: 0, version: 3 })).get('t1')?.x).toBe(0)
  })
})

describe('mergeKnown', () => {
  it('keeps a newer event position when an older board reload lands', () => {
    // The event (version 2) arrived while the reload (version 1) was on its way.
    const known = rememberMove(new Map(), moved({ x: 0, y: 0, version: 2 }))
    const reload = smallBoard({
      tokens: [{ ...board.tokens[0]!, x: 1, y: 0, version: 1 }],
    })
    expect(mergeKnown(reload, known).tokens[0]).toMatchObject({ x: 0, y: 0, version: 2 })
  })

  it('takes the reload when it is as new or newer', () => {
    const known = rememberMove(new Map(), moved({ x: 0, y: 0, version: 2 }))
    const reload = smallBoard({ tokens: [{ ...board.tokens[0]!, x: 2, y: 0, version: 3 }] })
    expect(mergeKnown(reload, known)).toBe(reload)
    const same = smallBoard({ tokens: [{ ...board.tokens[0]!, x: 0, y: 0, version: 2 }] })
    expect(mergeKnown(same, known)).toBe(same)
  })
})

describe('withPending', () => {
  it('draws the own move at its target until the server answers', () => {
    const shown = withPending(board, new Map([['t1', { x: 0, y: 1, elevation: 0 }]]))
    expect(shown.tokens[0]).toMatchObject({ x: 0, y: 1, version: 0 })
    expect(withPending(board, new Map())).toBe(board)
  })
})
