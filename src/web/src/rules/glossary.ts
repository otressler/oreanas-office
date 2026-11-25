// The Player's Handbook's rules glossary (knowledge/features/rules-glossary.md): loaded once for
// a signed-in person, it explains the terms a spell card marks "[[festgesetzt]]", links between
// its own entries and the conditions behind the statuses. The texts live on the server only,
// uploaded by an admin; without them nothing is underlined and nothing breaks.
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { GlossaryEntry } from '../api/types'

export const glossaryKeys = { all: ['rules', 'glossary'] as const }

const key = (words: string) => words.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

/** How names are compared: spacing and case don't count. */
export const nameKey = key

interface GlossaryData {
  byName: ReadonlyMap<string, GlossaryEntry>
}

export const useGlossaryData = create<GlossaryData>(() => ({ byName: new Map() }))

export function setGlossary(entries: GlossaryEntry[]) {
  useGlossaryData.setState({ byName: new Map(entries.map((e) => [key(e.name), e])) })
}

/** Loads the glossary into the store; mounted once inside the signed-in part of the app. */
export function useLoadGlossary() {
  const glossary = useQuery({
    queryKey: glossaryKeys.all,
    queryFn: () => unwrap(api.GET('/api/rules/glossary')),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  useEffect(() => {
    if (glossary.data) setGlossary(glossary.data)
  }, [glossary.data])
}

/** German endings a marked word may carry beyond the entry's name: "festgesetzte", "Blinden". */
const ENDINGS = ['en', 'em', 'er', 'es', 'e', 'n', 's']

/**
 * The entry a mark means: its target ("[[im Vorteil|Vorteil]]"), else its words as they stand
 * or without a German ending. Undefined when the glossary has no such entry.
 */
export function findEntry(
  byName: ReadonlyMap<string, GlossaryEntry>,
  words: string,
  target?: string | null,
): GlossaryEntry | undefined {
  return findByName(byName, words, target)
}

/** As findEntry, in any map keyed by lower-case names (nameKey). */
export function findByName<T>(
  byName: ReadonlyMap<string, T>,
  words: string,
  target?: string | null,
): T | undefined {
  const wanted = key(target ?? words)
  const exact = byName.get(wanted)
  if (exact || target) return exact
  for (const ending of ENDINGS) {
    if (wanted.length > ending.length + 2 && wanted.endsWith(ending)) {
      const entry = byName.get(wanted.slice(0, -ending.length))
      if (entry) return entry
    }
  }
  return undefined
}

/** The glossary entry of each library status (knowledge/features/statuses.md), Konzentration too. */
export const CONDITION_ENTRIES: Record<string, string> = {
  blinded: 'Blind',
  charmed: 'Bezaubert',
  deafened: 'Taub',
  exhaustion: 'Erschöpft',
  frightened: 'Verängstigt',
  grappled: 'Gepackt',
  incapacitated: 'Kampfunfähig',
  invisible: 'Unsichtbar',
  paralyzed: 'Gelähmt',
  petrified: 'Versteinert',
  poisoned: 'Vergiftet',
  prone: 'Liegend',
  restrained: 'Festgesetzt',
  stunned: 'Betäubt',
  unconscious: 'Bewusstlos',
  concentration: 'Konzentration',
}

/**
 * What the explanation shows: the entries opened, the last on top ("Zurück" goes down the
 * trail), the term it belongs to, and whether a tap pinned it or a mouse only hovers.
 */
interface GlossaryHint {
  trail: GlossaryEntry[]
  anchor: HTMLElement | null
  pinned: boolean
  open: (entry: GlossaryEntry, anchor: HTMLElement | null, pinned: boolean) => void
  follow: (entry: GlossaryEntry) => void
  back: () => void
  close: () => void
}

export const useGlossaryHint = create<GlossaryHint>((set) => ({
  trail: [],
  anchor: null,
  pinned: false,
  open: (entry, anchor, pinned) => set({ trail: [entry], anchor, pinned }),
  follow: (entry) => set((s) => ({ trail: [...s.trail, entry], pinned: true })),
  back: () => set((s) => ({ trail: s.trail.slice(0, -1) })),
  close: () => set({ trail: [], anchor: null, pinned: false }),
}))

// A mouse hovering a term shows its entry without a click, until it leaves both the term and
// the explanation; a short delay lets it move from one to the other.
let leaving: ReturnType<typeof setTimeout> | undefined
const canHover = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches

export function hoverTerm(entry: GlossaryEntry, anchor: HTMLElement) {
  if (!canHover()) return
  clearTimeout(leaving)
  const hint = useGlossaryHint.getState()
  if (!hint.pinned) hint.open(entry, anchor, false)
}

export function hoverStay() {
  clearTimeout(leaving)
}

export function hoverLeave() {
  clearTimeout(leaving)
  leaving = setTimeout(() => {
    if (!useGlossaryHint.getState().pinned) useGlossaryHint.getState().close()
  }, 200)
}
