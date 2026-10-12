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

/** A character's ring by colorIndex (wrapping around the palette), or the creature red. */
export function ringColor(token: Pick<BoardToken, 'kind' | 'colorIndex'>): string {
  if (token.kind === 'creature') return CREATURE_RING
  const n = CHARACTER_RINGS.length
  const index = (((token.colorIndex ?? 0) % n) + n) % n
  return CHARACTER_RINGS[index]!
}

/** The letter in the middle of a token: the label's first character, upper case. */
export function tokenLetter(label: string): string {
  const first = Array.from(label.trim())[0]
  return first ? first.toLocaleUpperCase('de-DE') : '?'
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
