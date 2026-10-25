// The initiative list's pure rules (knowledge/features/initiative.md): which list is newer,
// what the session DM's panel shows, moving an entry, and the setup screen's edits and
// order. Rolls use the dice tray's secure d20 (dice/notation.ts); the server rolls the first
// time, so players' devices never learn a creature's modifier.
import type {
  BoardState,
  BoardToken,
  InitiativeChangedEvent,
  InitiativeEntry,
  InitiativeRollMode,
  InitiativeView,
} from '../api/types'
import { rollDie } from '../dice/notation'

/** The server's limits (InitiativeRules). */
export const MODIFIER_MIN = -10
export const MODIFIER_MAX = 20
export const VALUE_MIN = -20
export const VALUE_MAX = 99

/** Normal, advantage, disadvantage: the order the screens offer them in. */
export const ROLL_MODES: readonly InitiativeRollMode[] = ['normal', 'advantage', 'disadvantage']

export type D20 = () => number

export const rollD20: D20 = () => rollDie(20)

/** The list with the higher version; the first one on a tie. */
export function newerInitiative(
  a: InitiativeView | null | undefined,
  b: InitiativeView | null | undefined,
): InitiativeView | null {
  if (!a) return b ?? null
  if (!b) return a
  return b.version > a.version ? b : a
}

/** Takes a change into the cached board, unless the board already has this version or a newer one. */
export function applyInitiative(board: BoardState, changed: InitiativeChangedEvent): BoardState {
  if (board.encounterId !== changed.encounterId) return board
  const newer = newerInitiative(board.initiative, changed.initiative)
  return newer === board.initiative ? board : { ...board, initiative: newer }
}

/** An entry with the token it belongs to, as the panel lists it. */
export interface ShownEntry {
  entry: InitiativeEntry
  token: BoardToken
}

/**
 * The entries of tokens on this board, in turn order. Tokens taken off the board keep their
 * entry, hidden here until they are back.
 */
export function shownEntries(
  entries: readonly InitiativeEntry[],
  tokens: readonly BoardToken[],
): ShownEntry[] {
  const byId = new Map(tokens.map((token) => [token.id, token]))
  return entries.flatMap((entry) => {
    const token = byId.get(entry.tokenId)
    return token ? [{ entry, token }] : []
  })
}

/**
 * Moves the shown entry at `from` to shown position `to`. Entries that aren't shown keep
 * their place between the shown ones they stood with.
 */
export function moveEntry(
  entries: readonly InitiativeEntry[],
  shownIds: readonly string[],
  from: number,
  to: number,
): InitiativeEntry[] {
  const id = shownIds[from]
  const moving = entries.find((entry) => entry.tokenId === id)
  if (id === undefined || !moving || from === to) return [...entries]
  const rest = entries.filter((entry) => entry.tokenId !== id)
  const others = shownIds.filter((other) => other !== id)
  const before = others[to]
  const index =
    before !== undefined
      ? rest.findIndex((entry) => entry.tokenId === before)
      : others.length > 0
        ? rest.findIndex((entry) => entry.tokenId === others[others.length - 1]) + 1
        : rest.length
  return [...rest.slice(0, index), moving, ...rest.slice(index)]
}

// ---- The setup screen ----------------------------------------------------------------

/** The d20 that counts: the lower one with disadvantage, else the higher. */
export function countingRoll(rolls: readonly number[], mode: InitiativeRollMode): number {
  return mode === 'disadvantage' ? Math.min(...rolls) : Math.max(...rolls)
}

/** A creature's value follows its d20s; a typed value has none and stays. */
function withRolls(entry: InitiativeEntry, rolls: number[]): InitiativeEntry {
  return {
    ...entry,
    rolls,
    value: rolls.length > 0 ? countingRoll(rolls, entry.mode) + entry.modifier : entry.value,
  }
}

export function setModifier(entry: InitiativeEntry, modifier: number): InitiativeEntry {
  return withRolls({ ...entry, modifier }, entry.rolls)
}

/**
 * Advantage and disadvantage add a second d20, which stays when switching between them;
 * back to normal keeps the first.
 */
export function setRollMode(
  entry: InitiativeEntry,
  mode: InitiativeRollMode,
  d20: D20,
): InitiativeEntry {
  if (entry.mode === mode) return entry
  const rolls =
    entry.rolls.length === 0
      ? []
      : mode === 'normal'
        ? entry.rolls.slice(0, 1)
        : entry.rolls.length === 1
          ? [entry.rolls[0]!, d20()]
          : entry.rolls
  return withRolls({ ...entry, mode }, rolls)
}

export function reroll(entry: InitiativeEntry, d20: D20): InitiativeEntry {
  return withRolls(entry, entry.mode === 'normal' ? [d20()] : [d20(), d20()])
}

/** A value typed in replaces the roll. */
export function setValue(entry: InitiativeEntry, value: number | null): InitiativeEntry {
  return { ...entry, value, rolls: [] }
}

/**
 * What the setup screen starts from: the saved entry of each token on the board, or else its
 * fresh roll; characters without either have no value yet. `kept` are saved entries of tokens
 * taken off the board, which go back into the list on saving.
 */
export function setupEntries(
  saved: readonly InitiativeEntry[] | null | undefined,
  rolled: readonly InitiativeEntry[],
  tokens: readonly BoardToken[],
): { entries: InitiativeEntry[]; kept: InitiativeEntry[] } {
  const savedById = new Map((saved ?? []).map((entry) => [entry.tokenId, entry]))
  const rolledById = new Map(rolled.map((entry) => [entry.tokenId, entry]))
  const onBoard = new Set(tokens.map((token) => token.id))
  const ordered = [
    ...tokens.filter((token) => token.kind === 'character'),
    ...tokens.filter((token) => token.kind === 'creature'),
  ]
  return {
    entries: ordered.map(
      (token) =>
        savedById.get(token.id) ??
        rolledById.get(token.id) ?? {
          tokenId: token.id,
          value: null,
          modifier: 0,
          mode: 'normal',
          rolls: [],
        },
    ),
    kept: (saved ?? []).filter((entry) => !onBoard.has(entry.tokenId)),
  }
}

/**
 * The saved list: highest value first, those without a value last, and on a tie the higher
 * modifier. Otherwise the entries keep the order of `previous` (the list as it was), then
 * the order given, so the DM's own order of equal values survives an edit.
 */
export function sortedForSave(
  entries: readonly InitiativeEntry[],
  previous: readonly InitiativeEntry[] = [],
): InitiativeEntry[] {
  const rank = new Map(previous.map((entry, index) => [entry.tokenId, index]))
  const order = (entry: InitiativeEntry, index: number) =>
    rank.get(entry.tokenId) ?? previous.length + index
  return entries
    .map((entry, index) => ({ entry, at: order(entry, index) }))
    .sort((a, b) => {
      const [va, vb] = [a.entry.value, b.entry.value]
      if (va === null || vb === null) {
        if (va !== vb) return va === null ? 1 : -1
      } else if (va !== vb) return vb - va
      return b.entry.modifier - a.entry.modifier || a.at - b.at
    })
    .map(({ entry }) => entry)
}

/** Whole numbers within the limits; anything else is no value. */
export function parseWhole(text: string, min: number, max: number): number | null {
  const trimmed = text.trim().replace('−', '-')
  if (!/^[+-]?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value >= min && value <= max ? value : null
}

/** "+2", "0", "−1": a modifier as the screen writes it. */
export function formatModifier(modifier: number): string {
  return modifier > 0 ? `+${modifier}` : modifier < 0 ? `−${-modifier}` : '0'
}
