// A marked rules term ("[[festgesetzt]]", knowledge/features/rules-glossary.md): a dashed
// underline that explains the term on a tap, or on hover with a mouse. Without a matching
// glossary entry it is plain text. A tap never reaches the card around it, so the card doesn't
// turn over.
import { findEntry, hoverLeave, hoverTerm, useGlossaryData, useGlossaryHint } from './glossary'

export function GlossaryTerm({ words, target }: { words: string; target?: string | null }) {
  const byName = useGlossaryData((s) => s.byName)
  const open = useGlossaryHint((s) => s.open)
  const shown = useGlossaryHint((s) => s.anchor)
  const entry = findEntry(byName, words, target)
  if (!entry) return <>{words}</>
  return (
    <button
      type="button"
      className="gl-term"
      aria-haspopup="dialog"
      aria-expanded={shown !== null && shown.dataset.term === entry.name}
      data-term={entry.name}
      onClick={(event) => {
        event.stopPropagation()
        open(entry, event.currentTarget, true)
      }}
      onMouseEnter={(event) => hoverTerm(entry, event.currentTarget)}
      onMouseLeave={hoverLeave}
    >
      {words}
    </button>
  )
}
