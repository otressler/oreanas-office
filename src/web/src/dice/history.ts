// "Letzte Würfe" kept on this device per person (knowledge/features/dice-tray.md), so the
// list survives a reload. Like the "Vibrieren" switch (table/haptics.ts), it lives in
// localStorage and is only a nicety: without storage the list starts empty.
import type { DiceHistoryEntry } from './diceRoller'
import { isSides } from './notation'

const MODES: readonly unknown[] = ['normal', 'advantage', 'disadvantage']

const key = (userId: string) => `oreana.dice.${userId}`

type Loose = Record<string, unknown>

const isRecord = (v: unknown): v is Loose => typeof v === 'object' && v !== null
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const validRoll = (r: unknown) =>
  isRecord(r) && isNumber(r.value) && (r.dropped === null || isNumber(r.dropped))

const validGroup = (g: unknown) =>
  isRecord(g) &&
  isNumber(g.sides) &&
  isSides(g.sides) &&
  Array.isArray(g.rolls) &&
  g.rolls.every(validRoll)

/** Keeps only well-formed entries: the tray puts the numbers into its markup. */
function valid(e: unknown): e is DiceHistoryEntry {
  return (
    isRecord(e) &&
    typeof e.notation === 'string' &&
    MODES.includes(e.mode) &&
    isNumber(e.modifier) &&
    isNumber(e.total) &&
    Array.isArray(e.groups) &&
    e.groups.every(validGroup)
  )
}

export function loadDiceHistory(userId: string): DiceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(key(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(valid) : []
  } catch {
    return []
  }
}

export function saveDiceHistory(userId: string, entries: readonly DiceHistoryEntry[]): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify(entries))
  } catch {
    // Without storage the list lasts until the page reloads.
  }
}
