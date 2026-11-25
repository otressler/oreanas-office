// When a card's texts are fitted (fit.ts needs real layout, so it is a stand-in here): the
// editor's preview switches between front and back of the same card, and each face must be
// fitted when it shows, or the front's title stays at its full size, cut off ("DUNKELSICH").
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const fitCard = vi.fn((root: HTMLElement) => {
  void root
  return false
})
vi.mock('./fit', () => ({ fitCard, updateScroll: vi.fn() }))

const { SpellCardView } = await import('./SpellCard')

const spell = {
  nameEn: 'Darkvision',
  level: 2,
  school: 'transmutation' as const,
  card: { name: 'Dunkelsicht', icon: 'eye', description: 'x', effects: [], pips: [] },
}

describe('fitting a card', () => {
  it('fits again when the preview switches to the other face', () => {
    const { rerender } = render(<SpellCardView spell={spell} side="back" />)
    const before = fitCard.mock.calls.length
    expect(before).toBeGreaterThan(0)

    rerender(<SpellCardView spell={spell} side="front" />)
    expect(fitCard.mock.calls.length).toBeGreaterThan(before)
    // It measured the front this time.
    expect(fitCard.mock.calls.at(-1)?.[0].querySelector('.sc-front')).not.toBeNull()
  })
})
