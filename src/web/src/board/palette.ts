// Colours of the plain board rendering. Calm and muted so the board stays readable
// on a phone in a dim room; tokens and the selection are the brightest things on it.
// The table colour matches --color-table in index.css: void shows the table.
import type { BoardToken, Terrain } from '../api/types'

export const TABLE_COLOR = '#14161b'
export const PARCHMENT = '#ece6d8'
export const CANDLE = '#e0ad4f'
export const CANDLE_STRONG = '#f0c46e'

/** Base colour per terrain. Void isn't drawn: the table shows through. */
export const TERRAIN_COLORS: Record<Exclude<Terrain, 'void'>, string> = {
  floor: '#5a5446',
  difficult: '#4d5539',
  water: '#2b4a5d',
  wall: '#393a42',
}

/** Slightly lighter and darker floor tiles, so a large floor doesn't look flat. */
export const FLOOR_TONES = ['#5a5446', '#5d5749', '#575143'] as const

export const PATTERN_COLORS = {
  hatch: 'rgba(16, 18, 14, 0.32)',
  wave: 'rgba(186, 218, 234, 0.32)',
  mortar: '#26272d',
  /** The dark edge where the map meets void or a wall. */
  rim: 'rgba(8, 9, 12, 0.55)',
  /** A step between whole meters of elevation: lit on the higher side, shaded below. */
  stepLight: 'rgba(236, 230, 216, 0.3)',
  stepShadow: 'rgba(8, 9, 12, 0.3)',
  grid: (alpha: number) => `rgba(12, 13, 16, ${alpha})`,
  /** Over a background picture: a dark line with a light twin beside it. */
  gridOnPicture: (alpha: number) => `rgba(10, 11, 14, ${Math.min(1, alpha * 1.2)})`,
  gridOnPictureLight: (alpha: number) => `rgba(236, 230, 216, ${alpha * 0.45})`,
}

export const FEATURE_COLORS = {
  stone: '#837b69',
  tree: '#3d5c35',
  treeLight: '#4e7443',
  wood: '#6e4f33',
  woodDark: '#4a3523',
  plank: '#7c5c3b',
  rope: '#cbb68c',
  stairs: '#7d7666',
  outline: '#141519',
  shadow: 'rgba(0, 0, 0, 0.42)',
  bevel: 'rgba(255, 255, 255, 0.16)',
  surface: 'rgba(236, 230, 216, 0.12)',
  surfaceLine: 'rgba(236, 230, 216, 0.5)',
}

export const ENTRANCE_COLORS = {
  band: 'rgba(236, 230, 216, 0.28)',
  arrow: 'rgba(236, 230, 216, 0.85)',
}

export const HIGHLIGHT_COLORS = {
  fill: 'rgba(224, 173, 79, 0.3)',
  outline: 'rgba(240, 196, 110, 0.9)',
}

/**
 * Ring colours for characters, picked by colorIndex: eight hues that stay apart on
 * the dark board and from the creatures' red and the candle-gold selection.
 */
export const CHARACTER_RINGS = [
  '#4da3ff', // blue
  '#4cc76a', // green
  '#f28c38', // orange
  '#b07cf0', // purple
  '#2fc4c0', // teal
  '#f064a8', // pink
  '#e3e05a', // lemon
  '#e8e4dc', // white
] as const

/** Every creature has the same red ring. */
export const CREATURE_RING = '#e5484d'

/**
 * A character's ring: the colour its player picked, else the default by colorIndex
 * (wrapping around the palette). Creatures get the red.
 */
export function ringColor(
  token: Pick<BoardToken, 'kind' | 'colorIndex'> & { color?: string | null },
): string {
  if (token.kind === 'creature') return CREATURE_RING
  if (token.color) return token.color
  return defaultRingColor(token.colorIndex)
}

/** The ring a character gets by its place in the campaign when its player picks none. */
export function defaultRingColor(colorIndex: number | null): string {
  const n = CHARACTER_RINGS.length
  const index = (((colorIndex ?? 0) % n) + n) % n
  return CHARACTER_RINGS[index]!
}

/**
 * A typed ring colour as the server stores it, "#rrggbb" in lower case, with or without
 * the "#"; null when it isn't six hex digits. Character.Color on the server.
 */
export function parseHexColor(text: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(text.trim())
  return match ? `#${match[1]!.toLowerCase()}` : null
}

/** The letter in the middle of a token: the label's first character, upper case. */
export function tokenLetter(label: string): string {
  const first = Array.from(label.trim())[0]
  return first ? first.toLocaleUpperCase('de-DE') : '?'
}

/**
 * What each token shows in its middle: its letter, and for creatures sharing a letter
 * the letter with a number (S1, S2, S3), so a DM can call them apart. Numbers follow
 * the labels in natural order, so "Goblin 1" and "Goblin 2" become G1 and G2.
 */
export function tokenMarks(
  tokens: readonly Pick<BoardToken, 'id' | 'kind' | 'label'>[],
  { fog = false }: { fog?: boolean } = {},
): Map<string, string> {
  const marks = new Map<string, string>()
  const creatures = new Map<string, Pick<BoardToken, 'id' | 'label'>[]>()
  for (const token of tokens) {
    const letter = tokenLetter(token.label)
    marks.set(token.id, letter)
    // With fog, a creature without a number in its label (not seen yet) keeps its plain letter.
    if (token.kind === 'creature' && (!fog || /\d$/.test(token.label)))
      creatures.set(letter, [...(creatures.get(letter) ?? []), token])
  }
  const byLabel = new Intl.Collator('de-DE', { numeric: true }).compare
  for (const [letter, group] of creatures) {
    if (group.length < 2) continue
    group
      .sort((a, b) => byLabel(a.label, b.label) || (a.id < b.id ? -1 : 1))
      .forEach((token, i) => marks.set(token.id, `${letter}${i + 1}`))
  }
  return marks
}

/** Mixes two #rrggbb colours: t = 0 gives a, t = 1 gives b. */
export function mixColor(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const parts = [0, 1, 2].map((i) =>
    Math.round(channel(a, i) * (1 - t) + channel(b, i) * t)
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${parts.join('')}`
}

/** The inside of a token: dark, tinted with its ring colour so it reads as one piece. */
export function tokenFill(ring: string): string {
  return mixColor(TABLE_COLOR, ring, 0.28)
}
