import { describe, expect, it } from 'vitest'
import { KIND_GROUPS, KIND_SUGGESTIONS, searchKinds, suggestionFor } from './kinds'

describe('suggested feature kinds', () => {
  it('offers each kind once', () => {
    const kinds = KIND_SUGGESTIONS.map((s) => s.kind.toLocaleLowerCase('de-DE'))
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('presets "blocks movement" by what a token can stand on', () => {
    expect(suggestionFor('Steg')?.blocksMovement).toBe(false)
    expect(suggestionFor('Falltür')?.blocksMovement).toBe(false)
    expect(suggestionFor('Sarkophag')?.blocksMovement).toBe(true)
    expect(suggestionFor(' lagerfeuer ')?.blocksMovement).toBe(true)
  })
})

describe('the catalog', () => {
  it('puts every kind in a section', () => {
    for (const s of KIND_SUGGESTIONS) expect(KIND_GROUPS).toContain(s.group)
  })

  it('searches without case, accents or umlauts', () => {
    expect(searchKinds('TÜR').map((s) => s.key)).toEqual(['door', 'trapdoor'])
    expect(searchKinds('kafig').map((s) => s.key)).toEqual(['cage'])
    expect(searchKinds('  ')).toHaveLength(KIND_SUGGESTIONS.length)
  })
})
