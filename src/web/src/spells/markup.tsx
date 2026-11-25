// The little markup of a card's texts (knowledge/domain/spell.md, "The card"): **bold**,
// *italic*, line breaks and rules terms marked "[[festgesetzt]]", which the glossary explains
// (knowledge/features/rules-glossary.md). Everything else stays plain text, so one player's
// card can't bring HTML or links onto another's screen.
import { Fragment, type ReactNode } from 'react'
import { GlossaryTerm } from '../rules/GlossaryTerm'
import { hyphenate, parseMarkup, splitTerms } from './markupText'

export function Markup({ text, hyphenate: shy = false }: { text: string; hyphenate?: boolean }) {
  const plain = (value: string) => (shy ? hyphenate(value) : value)
  const withTerms = (value: string): ReactNode =>
    splitTerms(value).map((part, index) =>
      part.kind === 'term' ? (
        <GlossaryTerm key={index} words={plain(part.text)} target={part.target} />
      ) : (
        <Fragment key={index}>{plain(part.text)}</Fragment>
      ),
    )
  const out: ReactNode[] = parseMarkup(text).map((run, index) => {
    switch (run.kind) {
      case 'break':
        return <br key={index} />
      case 'bold':
        return <b key={index}>{withTerms(run.text)}</b>
      case 'italic':
        return <i key={index}>{withTerms(run.text)}</i>
      default:
        return <Fragment key={index}>{withTerms(run.text)}</Fragment>
    }
  })
  return <>{out}</>
}
