// Turns the Player's Handbook's rules glossary (Anhang C) into regelglossar.json for the admin
// page's "Regelglossar übernehmen" (knowledge/features/rules-glossary.md). The texts are the
// Handbook's, so the files stay next to the export and never enter this repository.
//
//   node scripts/glossary-seed.mjs <regelglossar.md>
//
// Reads the glossary as a Markdown export of the Claude Doc "Regelglossar (Anhang C)": letter
// headings "## A", one "### Name [Tag]" heading per entry and the entry's text below it, up to
// the next heading. Writes regelglossar.json next to the Markdown file.
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2]
if (!file || !fs.existsSync(file)) {
  console.error('usage: node scripts/glossary-seed.mjs <regelglossar.md>')
  process.exit(1)
}

const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')
const entries = []
let entry = null
let started = false

const finish = () => {
  if (!entry) return
  entry.text = entry.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  delete entry.lines
  if (entry.text) entries.push(entry)
  entry = null
}

for (const line of lines) {
  // The entries start with the first letter heading; before it are the title and conventions.
  if (/^## [A-ZÄÖÜ]/.test(line) && !/^## Glossar/.test(line)) {
    finish()
    started = true
    continue
  }
  if (!started) continue
  const heading = /^### (.+?)\s*$/.exec(line)
  if (heading) {
    finish()
    // "Angriff \[Aktion\]": the name and its tag; the export escapes the brackets.
    const raw = heading[1].replace(/\\([[\]])/g, '$1')
    const tagged = /^(.*?)\s*\[([^\]]+)\]$/.exec(raw)
    entry = { name: (tagged ? tagged[1] : raw).trim(), tag: tagged ? tagged[2].trim() : null, lines: [] }
    continue
  }
  entry?.lines.push(line)
}
finish()

const names = new Set()
for (const e of entries) {
  const key = e.name.toLowerCase()
  if (names.has(key)) throw new Error(`"${e.name}" comes twice`)
  names.add(key)
}

// Links between entries, in the cards' markup "[[Name]]" (knowledge/features/rules-glossary.md):
// a quoted name („Begegnung“, as "Siehe auch" writes them), the names of a "·" list (the
// actions, the conditions) and a condition after "Zustand" ("den Zustand Bewusstlos").
const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e.name]))
const conditions = new Set(entries.filter((e) => e.tag === 'Zustand').map((e) => e.name))
const link = (words, self) => {
  const name = byName.get(words.trim().toLowerCase())
  return name && name !== self ? `[[${words.trim()}]]` : null
}
let links = 0
for (const e of entries) {
  const linked = e.text
    .split('\n')
    .map((line) => {
      // A line that is only names between "·" (no other text) lists entries.
      // Most of them are entries; the rest stay plain.
      if (line.includes(' · ') && !/[.:;]/.test(line)) {
        const parts = line.split(' · ')
        if (parts.filter((p) => byName.has(p.trim().toLowerCase())).length * 2 >= parts.length) {
          return parts.map((p) => link(p, e.name) ?? p).join(' · ')
        }
      }
      return line
        .replace(/„([^“]+)“/g, (all, words) => {
          const marked = link(words, e.name)
          return marked ? `„${marked}“` : all
        })
        // "den Zustand Bewusstlos", "die Zustände Kampfunfähig und Liegend".
        .replace(
          /(Zustand(?:es)?|Zustände) ([A-ZÄÖÜ][a-zäöüß]+(?:(?:, | und | oder )[A-ZÄÖÜ][a-zäöüß]+)*)/g,
          (all, word, names) =>
            `${word} ${names.replace(/[A-ZÄÖÜ][a-zäöüß]+/g, (name) =>
              conditions.has(name) && name !== e.name ? `[[${name}]]` : name,
            )}`,
        )
    })
    .join('\n')
  links += (linked.match(/\[\[/g) ?? []).length
  e.text = linked
}

const out = path.join(path.dirname(file), 'regelglossar.json')
fs.writeFileSync(
  out,
  JSON.stringify({ source: "Spielerhandbuch 2024, Anhang C „Regelglossar“", entries }, null, 2),
)
const tags = [...new Set(entries.map((e) => e.tag).filter(Boolean))]
console.log(`${entries.length} entries, ${links} links (tags: ${tags.join(", ")}) → ${out}`)
