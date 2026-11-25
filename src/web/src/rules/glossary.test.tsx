// The rules glossary in the app (knowledge/features/rules-glossary.md). The texts are made up;
// the real ones come from the server and never enter the repository.
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { GlossaryEntry } from '../api/types'
import { FlipCard } from '../spells/SpellCard'
import { splitTerms } from '../spells/markupText'
import { json, mockApi } from '../test/api'
import { de } from '../text/de'
import { findEntry, setGlossary, useGlossaryData, useGlossaryHint } from './glossary'
import { GlossaryLayer } from './GlossaryHint'

const entries: GlossaryEntry[] = [
  {
    name: 'Festgesetzt',
    tag: 'Zustand',
    text: 'Erfundener Text über **Fesseln**.\n\n*Siehe auch* „[[Gepackt]]“.',
  },
  { name: 'Gepackt', tag: 'Zustand', text: 'Gepackt ist erfunden.' },
  {
    name: 'Tragen',
    tag: null,
    text: 'Eine Tabelle:\n\n| Größe | Last |\n| --- | --- |\n| Klein | wenig |\n| [[Gepackt]] | viel |',
  },
]

const card = {
  name: 'Netz',
  castingTime: 'Aktion',
  range: '18 m',
  components: 'V, G',
  duration: '1 Stunde',
  concentration: false,
  ritual: false,
  description: 'Bei Misserfolg ist sie [[festgesetzt]] und **[[Gepackt]].** Sonst [[nichts]].',
  effects: [],
  icon: 'spark',
  pips: [],
  higherLevels: '',
  tip: '',
  material: '',
  source: '',
  writeIns: [],
}
const spell = { nameEn: 'Web', level: 2, school: 'conjuration' as const, card }

function renderWithLayer(children: React.ReactNode) {
  mockApi({ 'GET /api/rules/glossary': json(200, entries) })
  const client = createQueryClient()
  render(
    <QueryClientProvider client={client}>
      {children}
      <GlossaryLayer />
    </QueryClientProvider>,
  )
}

beforeEach(() => setGlossary(entries))
afterEach(() => {
  act(() => useGlossaryHint.getState().close())
  setGlossary([])
})

describe('finding an entry', () => {
  it('takes the target, the words as they stand or without a German ending', () => {
    const { byName } = useGlossaryData.getState()
    expect(findEntry(byName, 'festgesetzte')?.name).toBe('Festgesetzt')
    expect(findEntry(byName, 'GEPACKTEN')?.name).toBe('Gepackt')
    expect(findEntry(byName, 'im Griff', 'Gepackt')?.name).toBe('Gepackt')
    expect(findEntry(byName, 'im Griff', 'Nichts')).toBeUndefined()
    expect(findEntry(byName, 'Fest')).toBeUndefined()
  })

  it('reads marks with and without a target', () => {
    expect(splitTerms('a [[b]] c [[im Vorteil|Vorteil]]')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'term', text: 'b' },
      { kind: 'text', text: ' c ' },
      { kind: 'term', text: 'im Vorteil', target: 'Vorteil' },
    ])
  })
})

describe('a term on a card', () => {
  it('explains itself on a tap without turning the card, and links on to other entries', async () => {
    const user = userEvent.setup()
    renderWithLayer(<FlipCard spell={spell} />)
    const flip = screen.getByRole('button', { name: 'Netz: Karte umdrehen' })
    // The terms are on the back.
    await user.click(flip)
    expect(flip).toHaveAttribute('aria-pressed', 'true')
    // An unknown term stays plain text.
    expect(screen.queryByRole('button', { name: 'nichts' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'festgesetzt' }))
    expect(flip).toHaveAttribute('aria-pressed', 'true')
    const hint = screen.getByRole('dialog', { name: 'Festgesetzt' })
    expect(within(hint).getByText('Zustand')).toBeInTheDocument()
    expect(within(hint).getByText('Fesseln').tagName).toBe('STRONG')

    // A link to another entry, and back.
    await user.click(within(hint).getByRole('button', { name: 'Gepackt' }))
    const next = screen.getByRole('dialog', { name: 'Gepackt' })
    expect(within(next).getByText('Gepackt ist erfunden.')).toBeInTheDocument()
    await user.click(within(next).getByRole('button', { name: de.rules.glossary.back }))
    expect(screen.getByRole('dialog', { name: 'Festgesetzt' })).toBeInTheDocument()

    // Escape closes only the explanation; the flip button still turns the card.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(flip)
    expect(flip).toHaveAttribute('aria-pressed', 'false')
  })

  it('finds a term inside bold text', () => {
    renderWithLayer(<FlipCard spell={spell} flipped />)
    const term = screen.getByRole('button', { name: 'Gepackt' })
    expect(term.closest('b')).not.toBeNull()
  })

  it('shows an entry’s table with its links', async () => {
    const user = userEvent.setup()
    renderWithLayer(<FlipCard spell={spell} />)
    act(() => useGlossaryHint.getState().open(entries[2], null, true))
    const hint = screen.getByRole('dialog', { name: 'Tragen' })
    const table = within(hint).getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Größe', 'Last'])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    await user.click(within(table).getByRole('button', { name: 'Gepackt' }))
    expect(screen.getByRole('dialog', { name: 'Gepackt' })).toBeInTheDocument()
  })

  it('is plain text while there is no glossary', () => {
    setGlossary([])
    renderWithLayer(<FlipCard spell={spell} />)
    expect(screen.queryByRole('button', { name: 'festgesetzt' })).toBeNull()
    expect(screen.getAllByText(/festgesetzt/).length).toBeGreaterThan(0)
  })
})
