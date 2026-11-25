import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { CharacterSpell, SpellVariant } from '../api/types'
import { parseBlocks, parseMarkup } from './markupText'
import { matchesSpell, nameForEditing, nameFromEditing } from './model'
import { pictureType, spellKeys } from './queries'
import { FlipCard, SpellCardBack, SpellCardFront } from './SpellCard'
import { SpellGalleryButton } from './SpellGalleryButton'

const card = {
  name: 'Mondstrahl',
  castingTime: '1 Aktion',
  range: '36 m',
  components: 'V, G, M',
  duration: 'bis 1 Minute',
  concentration: true,
  ritual: false,
  description: 'Ein **silbriger** Strahl.\nZweite *Zeile* <img src=x>',
  effects: [
    {
      icon: 'moon',
      title: 'Zylinder',
      tag: 'Magie-Aktion',
      text: 'RW Konstitution',
      chip: { big: '2W10', small: 'Gleißend', kind: 'radiant' as const },
    },
  ],
  icon: 'moon',
  pips: ['moon'],
  higherLevels: '+1W10 je Grad über 2',
  tip: '',
  material: 'ein Mondsamenblatt',
  source: '',
  writeIns: ['saveDc' as const],
}
const spell = { nameEn: 'Moonbeam', level: 2, school: 'evocation' as const, card }

describe('markup', () => {
  it('knows bold, italic and line breaks, and nothing else', () => {
    expect(parseMarkup('a **b** *c*\nd <i>e</i>')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'italic', text: 'c' },
      { kind: 'break', text: '' },
      { kind: 'text', text: 'd <i>e</i>' },
    ])
  })
})

describe('parseBlocks', () => {
  it('makes paragraphs at blank lines and lists of "- " lines', () => {
    expect(
      parseBlocks(
        '**Wand.** Bis 27 m lang.\nOder eine Kugel.\n\n\n**Wahl.** Eins davon:\n- Feuer\n-  Kälte \n\nEnde -1W4',
      ),
    ).toEqual([
      { kind: 'paragraph', text: '**Wand.** Bis 27 m lang.\nOder eine Kugel.' },
      { kind: 'paragraph', text: '**Wahl.** Eins davon:' },
      { kind: 'list', items: ['Feuer', 'Kälte'] },
      { kind: 'paragraph', text: 'Ende -1W4' },
    ])
    // A line of text after a list starts a new paragraph.
    expect(parseBlocks('- a\nb')).toEqual([
      { kind: 'list', items: ['a'] },
      { kind: 'paragraph', text: 'b' },
    ])
  })
})

describe('break points in names', () => {
  it('are "|" in the editor, soft hyphens on the card, and nothing for search', () => {
    expect(nameFromEditing('Sonnen|explosion')).toBe('Sonnen­explosion')
    expect(nameForEditing('Sonnen­explosion')).toBe('Sonnen|explosion')
    expect(matchesSpell({ name: 'Sonnen­explosion', nameEn: 'Sunburst' }, 'sonnenex')).toBe(true)
  })
})

describe('matchesSpell', () => {
  it('finds German and English names without case or umlauts', () => {
    const s = { name: 'Göttliche Führung', nameEn: 'Guidance' }
    expect(matchesSpell(s, 'gottliche')).toBe(true)
    expect(matchesSpell(s, 'GUID')).toBe(true)
    expect(matchesSpell(s, 'mond')).toBe(false)
    expect(matchesSpell(s, '  ')).toBe(true)
  })
})

describe('pictureType', () => {
  it('reads the type from the bytes, not the name', async () => {
    const jpegNamedPng = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/png' })
    expect(await pictureType(jpegNamedPng)).toBe('image/jpeg')
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])])
    expect(await pictureType(png)).toBe('image/png')
  })
})

describe('the card', () => {
  it('shows the front with the level, school and concentration badge', () => {
    const { container } = render(<SpellCardFront spell={spell} />)
    expect(screen.getByRole('heading', { name: 'Mondstrahl' })).toBeInTheDocument()
    expect(screen.getByText('Hervorrufung')).toBeInTheDocument()
    expect(screen.getByTitle('Konzentration')).toHaveTextContent('K')
    // Without art the school's pattern shows instead of a picture.
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.sc-no-art')).not.toBeNull()
  })

  it('shows the back with stats, markup as text formatting, effects and footer', () => {
    const { container } = render(<SpellCardBack spell={spell} />)
    expect(screen.getByText('Moonbeam')).toBeInTheDocument()
    expect(screen.getByText('36 m')).toBeInTheDocument()
    expect(container.querySelector('.sc-desc b')).toHaveTextContent('silbriger')
    expect(container.querySelector('.sc-desc i')).toHaveTextContent('Zeile')
    // Raw HTML stays text.
    expect(container.querySelector('.sc-desc img')).toBeNull()
    expect(container.querySelector('.sc-desc')).toHaveTextContent('<img src=x>')
    expect(screen.getByText('Magie-Aktion')).toBeInTheDocument()
    expect(screen.getByText('2W10')).toBeInTheDocument()
    expect(screen.getByText('Höherer Grad:')).toBeInTheDocument()
    expect(screen.getByText('ein Mondsamenblatt')).toBeInTheDocument()
    expect(screen.getByText('SG')).toBeInTheDocument()
  })

  it('shows the description as paragraphs and lists', () => {
    const long = {
      ...spell,
      card: { ...card, description: '**Licht.** Hell.\n\n**Wahl.** Eins:\n- **Feuer**\n- Kälte' },
    }
    const { container } = render(<SpellCardBack spell={long} />)
    const blocks = [...container.querySelectorAll('.sc-body > .sc-desc, .sc-body > .sc-list')]
    expect(blocks.map((b) => b.tagName)).toEqual(['P', 'P', 'UL'])
    expect(blocks[0].querySelector('b')).toHaveTextContent('Licht.')
    expect([...blocks[2].querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Feuer',
      'Kälte',
    ])
    expect(blocks[2].querySelector('li b')).toHaveTextContent('Feuer')
  })

  it('shows a table between the text and the effects, with keys, colours and chips', () => {
    const withTable = {
      ...spell,
      card: {
        ...card,
        tables: [
          {
            caption: 'Je Schicht RW Geschick',
            rows: [
              {
                key: '1',
                color: 'red' as const,
                title: 'Rot',
                text: 'Hält Pfeile auf.\n**Zerstört:** 25 Kälteschaden',
                chip: { big: '12W6', small: 'Feuer', kind: 'fire' as const },
              },
              { key: '', color: null, title: '', text: 'nur Text', chip: null },
            ],
          },
        ],
      },
    }
    const { container } = render(<SpellCardBack spell={withTable} />)
    expect(screen.getByText('Je Schicht RW Geschick')).toBeInTheDocument()
    const rows = container.querySelectorAll('.sc-body .sc-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveClass('c-red')
    expect(rows[0].querySelector('.sc-key')).toHaveTextContent('1')
    expect(rows[0].querySelector('p b')).toHaveTextContent('Zerstört:')
    expect(rows[0].querySelector('.sc-chip.k-fire')).toHaveTextContent('12W6')
    expect(rows[1]).toHaveClass('sc-no-chip')
    expect(rows[1].querySelector('h3')).toBeNull()
    // The table comes before the effect rows, in the part that scrolls.
    const body = container.querySelector('.sc-body')!
    expect(body.firstElementChild).toHaveClass('sc-desc')
    expect(body.querySelector('.sc-table ~ .sc-effects')).not.toBeNull()
  })

  it('turns over on a tap and with the keyboard', async () => {
    render(<FlipCard spell={spell} />)
    const button = screen.getByRole('button', { name: 'Mondstrahl: Karte umdrehen' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    button.focus()
    await userEvent.keyboard('{Enter}')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SpellGalleryButton', () => {
  const variant = (name: string): SpellVariant => ({
    id: `v-${name}`,
    spellId: `s-${name}`,
    nameEn: name,
    level: 1,
    school: 'evocation',
    author: { id: 'u', displayName: 'Mira' },
    basedOnVariantId: null,
    origin: 'manual',
    card: { ...card, name },
    artAssetId: null,
    artUrl: null,
    artApproved: false,
    usedBy: 1,
    canEdit: false,
    createdAt: '2026-11-21T00:00:00Z',
    updatedAt: '2026-11-21T00:00:00Z',
  })
  const entry = (name: string, prepared: boolean): CharacterSpell => ({
    spellId: `s-${name}`,
    prepared,
    addedAt: '2026-11-21T00:00:00Z',
    variant: variant(name),
  })

  function renderButton(
    spells: Record<string, CharacterSpell[]>,
    characters = [{ id: 'c1', name: 'Liriel' }],
  ) {
    const queryClient = createQueryClient()
    queryClient.setQueryData(spellKeys.campaign('camp'), spells)
    render(
      <QueryClientProvider client={queryClient}>
        <SpellGalleryButton campaignId="camp" characters={characters} />
      </QueryClientProvider>,
    )
  }

  it('is hidden while the characters have nothing prepared', () => {
    renderButton({ c1: [entry('Eismesser', false)] })
    expect(screen.queryByRole('button', { name: 'Zauber' })).toBeNull()
  })

  it('opens the prepared spells, with a tab per character', async () => {
    renderButton(
      {
        c1: [entry('Eismesser', true), entry('Donnerwoge', false)],
        c2: [entry('Heilendes Wort', true)],
      },
      [
        { id: 'c1', name: 'Liriel' },
        { id: 'c2', name: 'Brom' },
      ],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Zauber' }))
    const dialog = screen.getByRole('dialog', { name: 'Vorbereitete Zauber' })
    expect(
      within(dialog).getByRole('button', { name: 'Eismesser: Karte umdrehen' }),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Donnerwoge: Karte umdrehen' })).toBeNull()

    await userEvent.click(within(dialog).getByRole('tab', { name: 'Brom' }))
    expect(
      within(dialog).getByRole('button', { name: 'Heilendes Wort: Karte umdrehen' }),
    ).toBeInTheDocument()
  })
})
