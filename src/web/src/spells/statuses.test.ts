// The conditions a card marks, which the editor suggests as statuses it offers
// (knowledge/features/spell-cards.md, "Statuses when a spell is added").
import { describe, expect, it } from 'vitest'
import type { SpellCard } from '../api/types'
import { conditionChoices, markedConditions } from './statuses'

const card = (fields: Partial<SpellCard>): SpellCard => ({
  name: 'Verstricken',
  icon: 'leaf',
  description: '',
  effects: [],
  pips: [],
  ...fields,
})

describe('markedConditions', () => {
  it('finds marked conditions by name, with German endings, in the library’s order', () => {
    const marked = card({
      description:
        'Jede Kreatur wird [[festgesetzt]]; eine [[liegende]] bleibt liegen. [[Konzentration]] zählt nicht.',
      effects: [{ icon: 'leaf', title: 'Ranken', text: 'Ziel ist [[im Bann|Bezaubert]]' }],
    })
    expect(markedConditions(marked)).toEqual(['charmed', 'prone', 'restrained'])
  })

  it('knows a condition by the glossary’s name and by the status’s', () => {
    expect(markedConditions(card({ description: '[[Erschöpft]]' }))).toEqual(['exhaustion'])
    expect(markedConditions(card({ description: '[[Erschöpfung]]' }))).toEqual(['exhaustion'])
  })

  it('looks into table rows, and ignores words that aren’t marked', () => {
    const table = card({
      description: 'Blind und taub, aber nicht markiert.',
      tables: [{ caption: '', rows: [{ key: '1', title: 'Rot', text: '[[Vergiftet]]' }] }],
    })
    expect(markedConditions(table)).toEqual(['poisoned'])
  })
})

describe('conditionChoices', () => {
  it('keeps a ticked condition whose mark is gone, so it can be unticked', () => {
    expect(
      conditionChoices(card({ description: '[[Liegend]]', statuses: ['restrained'] })),
    ).toEqual(['prone', 'restrained'])
  })
})
