// Turns the spell-cards app's spells into spell-seed.json for the admin page's "Zauberkarten
// übernehmen" (knowledge/features/spell-cards.md, "Seeding from spell-cards"). The texts follow
// the Player's Handbook, so the file stays next to the spell-cards app and never enters this
// repository.
//
//   node scripts/spell-seed.mjs <spell-cards folder>
//
// Reads spells.js (the SPELLS array), the art motifs prompts/<id>-<letter>.txt and, from the
// studio's database (studio/studio.db), which motif each spell's selected picture belongs to
// (artLetter). Writes <spell-cards folder>/spell-seed.json. The admin page then uploads it with
// the art from art/, which the studio keeps as a copy of the selected picture.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const folder = process.argv[2]
if (!folder || !fs.existsSync(path.join(folder, 'spells.js'))) {
  console.error('usage: node scripts/spell-seed.mjs <spell-cards folder with spells.js>')
  process.exit(1)
}

// spells.js declares `const SPELLS = [...]` for a browser page; evaluate it in a function.
const SPELLS = new Function(
  `${fs.readFileSync(path.join(folder, 'spells.js'), 'utf8')}; return SPELLS;`,
)()

const SCHOOLS = {
  abj: 'abjuration',
  conj: 'conjuration',
  div: 'divination',
  ench: 'enchantment',
  evoc: 'evocation',
  illu: 'illusion',
  necro: 'necromancy',
  trans: 'transmutation',
}
const CHIP_KINDS = { pierce: 'piercing' }
const WRITE_INS = { atk: 'attack', dc: 'saveDc', mod: 'modifier' }

// The cards' HTML as the app's markup: <b> → **, <i> → *, <br> → a line break.
const markup = (html = '') =>
  html
    .replace(/<b>(.*?)<\/b>/g, '**$1**')
    .replace(/<i>(.*?)<\/i>/g, '*$1*')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()

const subjectOf = (text) =>
  text
    .split(/\r?\n/)
    .find((line) => line.startsWith('Subject:'))
    ?.slice(8)
    .trim() ?? text.match(/Subject:\s*([\s\S]*?)\s*(?:Vertical portrait|$)/)?.[1].trim()

function prompts(id) {
  const dir = path.join(folder, 'prompts')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .map((file) => file.match(new RegExp(`^${id.replace(/[-]/g, '\\-')}-([a-z])\\.txt$`)))
    .filter(Boolean)
    .map(([file, letter]) => ({
      letter,
      subject: subjectOf(fs.readFileSync(path.join(dir, file), 'utf8')),
    }))
    .filter((p) => p.subject)
    .sort((a, b) => a.letter.localeCompare(b.letter))
}

// The motif letter of each spell's selected picture in the studio, if it has one.
function selectedLetters() {
  const file = path.join(folder, 'studio', 'studio.db')
  if (!fs.existsSync(file)) return new Map()
  const db = new DatabaseSync(file, { readOnly: true })
  const letters = new Map()
  for (const s of SPELLS) {
    const select = db
      .prepare(
        "SELECT value FROM events WHERE spell_id = ? AND kind = 'select' ORDER BY id DESC LIMIT 1",
      )
      .get(s.id)
    const image =
      select && db.prepare('SELECT variant FROM images WHERE id = ?').get(Number(select.value))
    if (image?.variant) letters.set(s.id, image.variant)
  }
  db.close()
  return letters
}
const artLetters = selectedLetters()

const spells = SPELLS.map((s) => ({
  key: s.id,
  nameEn: s.en,
  level: s.level,
  school: SCHOOLS[s.school],
  card: {
    name: s.de,
    castingTime: s.time ?? '',
    range: s.range ?? '',
    components: s.comp ?? '',
    duration: s.dur ?? '',
    concentration: !!s.conc,
    ritual: !!s.ritual,
    description: markup(s.desc),
    effects: (s.rows ?? []).map((r) => ({
      icon: r.icon,
      title: r.title,
      tag: r.tag ?? null,
      text: markup(r.text),
      chip: r.chip
        ? {
            big: r.chip.big,
            small: r.chip.small ?? null,
            kind: r.chip.kind ? (CHIP_KINDS[r.chip.kind] ?? r.chip.kind) : null,
          }
        : null,
    })),
    icon: s.icon,
    pips: s.pips ?? [],
    higherLevels: markup(s.scale ?? s.upcast ?? ''),
    tip: markup(s.tip ?? ''),
    material: markup(s.mat ?? ''),
    source: s.src ?? '',
    writeIns: (s.write ?? []).map((w) => WRITE_INS[w]),
  },
  prompts: prompts(s.id),
  artLetter: artLetters.get(s.id) ?? null,
}))

const out = path.join(folder, 'spell-seed.json')
fs.writeFileSync(out, JSON.stringify({ spells }, null, 2))
console.log(
  `${spells.length} spells, ${spells.reduce((n, s) => n + s.prompts.length, 0)} motifs → ${out}`,
)
