import { describe, expect, it } from 'vitest'
import { isUndoVisible, undoCandidate } from './undo'

const tokens = [
  { id: 't1', version: 3 },
  { id: 't2', version: 0 },
]

describe('undoCandidate', () => {
  it('takes the board’s move until the device has its own say', () => {
    const fromBoard = { tokenId: 't1', version: 3 }
    expect(undoCandidate(undefined, fromBoard)).toBe(fromBoard)
    expect(undoCandidate(undefined, null)).toBeNull()
    const own = { tokenId: 't2', version: 1 }
    expect(undoCandidate(own, fromBoard)).toBe(own)
    expect(undoCandidate(null, fromBoard)).toBeNull()
  })
})

describe('isUndoVisible', () => {
  it('shows while the move is the token’s latest and the table is connected', () => {
    expect(isUndoVisible({ tokenId: 't1', version: 3 }, tokens, true)).toBe(true)
  })

  it('hides once someone moved the token again', () => {
    expect(isUndoVisible({ tokenId: 't1', version: 2 }, tokens, true)).toBe(false)
  })

  it('hides while disconnected, without a move, or for a token that is gone', () => {
    expect(isUndoVisible({ tokenId: 't1', version: 3 }, tokens, false)).toBe(false)
    expect(isUndoVisible(null, tokens, true)).toBe(false)
    expect(isUndoVisible({ tokenId: 'gone', version: 3 }, tokens, true)).toBe(false)
  })
})
