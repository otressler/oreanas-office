// Dice notation for the dice tray (knowledge/features/dice-tray.md), written the German
// way: "2W6 + W8 + 3", W100 for percentile. Reading also takes the English "d" and "d%",
// since people type what they know.

export const SIDES = [4, 6, 8, 10, 12, 20, 100] as const
export type Sides = (typeof SIDES)[number]

export type RollMode = 'normal' | 'advantage' | 'disadvantage'

export const MODIFIER_LIMIT = 99

export function isSides(value: number): value is Sides {
  return (SIDES as readonly number[]).includes(value)
}

/** One die's result. `dropped` is the other d20 of a roll with advantage or disadvantage. */
export interface DieRoll {
  value: number
  dropped: number | null
}

export interface RollGroup {
  sides: Sides
  rolls: DieRoll[]
}

/** "W20", or "3W6" for several. */
export function dieName(sides: Sides, count = 1): string {
  return `${count > 1 ? count : ''}W${sides}`
}

/** The pool as notation, e.g. "2W6 + W20 + 3"; a lone modifier stays a number ("-2"). */
export function formatNotation(dice: readonly Sides[], modifier: number): string {
  const counts = new Map<Sides, number>()
  for (const sides of dice) counts.set(sides, (counts.get(sides) ?? 0) + 1)
  let text = SIDES.filter((s) => counts.has(s))
    .map((s) => dieName(s, counts.get(s)))
    .join(' + ')
  if (modifier) {
    text += text ? ` ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}` : String(modifier)
  }
  return text
}

/**
 * Reads "2W6+1W8+3", "d20 - 1" or "W%". Unknown dice and subtracted dice are skipped,
 * at most 100 of one kind are read, and the modifier is held to ±99.
 */
export function parseNotation(text: string): { dice: Sides[]; modifier: number } {
  const s = text.replace(/[−–]/g, '-').replace(/\s+/g, '').toLowerCase()
  const dice: Sides[] = []
  let modifier = 0
  const term = /([+-]?)(\d*)[dw](\d+|%)|([+-]?)(\d+)/g
  for (const m of s.matchAll(term)) {
    if (m[3] !== undefined) {
      const count = Math.min(parseInt(m[2] || '1', 10), 100)
      const sides = m[3] === '%' ? 100 : parseInt(m[3], 10)
      if (m[1] === '-' || !isSides(sides)) continue
      for (let i = 0; i < count; i++) dice.push(sides)
    } else {
      modifier += (m[4] === '-' ? -1 : 1) * parseInt(m[5]!, 10)
    }
  }
  return { dice, modifier: clampModifier(modifier) }
}

export function clampModifier(value: number): number {
  return Math.max(-MODIFIER_LIMIT, Math.min(MODIFIER_LIMIT, Math.trunc(value) || 0))
}

/** For display: a real minus sign instead of the hyphen. */
export function displayNotation(text: string): string {
  return text.replace(/ - /g, ' − ').replace(/^-/, '−')
}

/** The pool sorted by die and counted into groups, as the readout and history show them. */
export function groupRolls(dice: readonly { sides: Sides; roll: DieRoll }[]): RollGroup[] {
  return SIDES.map((sides) => ({
    sides,
    rolls: dice.filter((d) => d.sides === sides).map((d) => d.roll),
  })).filter((g) => g.rolls.length > 0)
}

/** A whole number from 1 to `n`, from the browser's secure random source, without bias. */
export function rollDie(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n
  const buffer = new Uint32Array(1)
  let x: number
  do {
    crypto.getRandomValues(buffer)
    x = buffer[0]!
  } while (x >= limit)
  return (x % n) + 1
}

/**
 * One d20 under a roll mode: with advantage the higher of two, with disadvantage the
 * lower, the other one dropped.
 */
export function rollD20(mode: RollMode, roll: (n: number) => number = rollDie): DieRoll {
  const a = roll(20)
  if (mode === 'normal') return { value: a, dropped: null }
  const b = roll(20)
  const value = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b)
  return { value, dropped: value === a ? b : a }
}
