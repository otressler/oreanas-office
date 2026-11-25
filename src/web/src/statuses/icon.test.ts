// Which picture a status is drawn with (knowledge/features/statuses.md, "Icons").
import { describe, expect, it } from 'vitest'
import { spellIconUrl, statusIconSrc } from './icon'

describe('statusIconSrc', () => {
  it('takes the picture first, then a spell status’s card icon, else none', () => {
    expect(statusIconSrc({ iconUrl: '/statuses/prone.webp', spellIcon: null })).toBe(
      '/statuses/prone.webp',
    )
    expect(statusIconSrc({ iconUrl: '/api/assets/a1', spellIcon: 'eye' })).toBe('/api/assets/a1')
    expect(statusIconSrc({ iconUrl: null, spellIcon: 'eye' })).toBe(spellIconUrl('eye'))
    expect(statusIconSrc({ iconUrl: null, spellIcon: null })).toBeNull()
  })

  it('draws a card icon as a sized SVG, and nothing for an unknown name', () => {
    const svg = decodeURIComponent(spellIconUrl('eye')!.split(',')[1]!)
    expect(svg).toMatch(/^<svg [^>]*width="96" height="96"/)
    expect(svg).toContain('<circle cx="12" cy="12" r="3"/>')
    expect(spellIconUrl('nonsense')).toBeNull()
  })
})
