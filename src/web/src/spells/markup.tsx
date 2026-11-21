// The little markup of a card's texts (knowledge/domain/spell.md, "The card"): **bold**,
// *italic* and line breaks. Everything else stays plain text, so one player's card can't
// bring HTML or links onto another's screen.
import { Fragment, type ReactNode } from 'react'
import { hyphenate, parseMarkup } from './markupText'

export function Markup({ text, hyphenate: shy = false }: { text: string; hyphenate?: boolean }) {
  const out: ReactNode[] = parseMarkup(text).map((run, index) => {
    const value = shy ? hyphenate(run.text) : run.text
    switch (run.kind) {
      case 'break':
        return <br key={index} />
      case 'bold':
        return <b key={index}>{value}</b>
      case 'italic':
        return <i key={index}>{value}</i>
      default:
        return <Fragment key={index}>{value}</Fragment>
    }
  })
  return <>{out}</>
}
