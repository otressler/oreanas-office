import { describe, expect, it } from 'vitest'
import { canMoveAsTable, charactersOnTop, hasControls } from './rules'

describe('shared screen rules', () => {
  it('moves every character and no creature', () => {
    expect(canMoveAsTable({ kind: 'character' })).toBe(true)
    expect(canMoveAsTable({ kind: 'creature' })).toBe(false)
  })

  it('draws every character above the creatures', () => {
    const tokens = [
      { id: 'a', kind: 'character' as const },
      { id: 'b', kind: 'creature' as const },
      { id: 'c', kind: 'character' as const },
    ]
    expect(charactersOnTop(tokens).map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('has controls only in local mode', () => {
    expect(hasControls('local')).toBe(true)
    expect(hasControls('byod')).toBe(false)
  })
})
