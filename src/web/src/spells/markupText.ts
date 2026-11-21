// Parsing for the cards' markup (markup.tsx).

// Long German rules words get soft hyphens where they may break, as in the spell-cards app
// (render.js, SHY); the browser's own hyphenation does the rest.
const SHY: [RegExp, string][] = [
  [
    /(Konstitutions|Geschicklichkeits|Weisheits|Stärke|Charisma|Intelligenz|Zauber)(rettungs)/g,
    '$1­$2',
  ],
  [/(rettungs)(wurf|würf)/g, '$1­$2'],
  [/(Geschicklichkeits|Weisheits|Stärke|Schadens|Attributs)(würf|wurf)/g, '$1­$2'],
  [/(Zauber)(angriff|attribut)/g, '$1­$2'],
  [/(attributs)(modifikator)/g, '$1­$2'],
  [/(Treffer)(punkt|würfel)/g, '$1­$2'],
  [/(Gesamt|Gift|Stich|Kälte|Feuer|Schall|Energie|Säure|Blitz|Hieb|Wucht)(schaden)/g, '$1­$2'],
  [/(Konzentrations)(rettungs)/g, '$1­$2'],
  [/(Wirkungs)(dauer)/g, '$1­$2'],
  [/(Bewegungs)(rate|richtung)/g, '$1­$2'],
  [/(Gelegenheits)(angriff)/g, '$1­$2'],
  [/(Zauberangriffs)(bonus)/g, '$1­$2'],
]

export const hyphenate = (text: string) =>
  SHY.reduce((acc, [re, rep]) => acc.replace(re, rep), text)

/** Splits "a **b** *c*" into plain, bold and italic runs; an unclosed marker stays as it is. */
export function parseMarkup(
  text: string,
): { kind: 'text' | 'bold' | 'italic' | 'break'; text: string }[] {
  const runs: { kind: 'text' | 'bold' | 'italic' | 'break'; text: string }[] = []
  const pattern = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|\n/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) runs.push({ kind: 'text', text: text.slice(last, match.index) })
    if (match[0] === '\n') runs.push({ kind: 'break', text: '' })
    else if (match[1] != null) runs.push({ kind: 'bold', text: match[1] })
    else runs.push({ kind: 'italic', text: match[2] })
    last = match.index + match[0].length
  }
  if (last < text.length) runs.push({ kind: 'text', text: text.slice(last) })
  return runs
}
