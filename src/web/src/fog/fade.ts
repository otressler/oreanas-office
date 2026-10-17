// The fog fading away over revealed cells and back in over hidden ones, about half a second
// (knowledge/features/fog-of-war.md, "What players see"). The board keeps one fade per
// changed cell and reads each cell's opacity while it draws; this file is the pure part.
import { diffFog, type CellSet } from './cells'

/** How long fog takes to fade, as tokens do when they appear or go. */
export const FOG_FADE_MS = 500

/** A cell whose fog is fading: away (`reveal`) or in. */
export interface CellFade {
  start: number
  reveal: boolean
}

export type FogFades = ReadonlyMap<string, CellFade>

export const NO_FADES: FogFades = new Map()

/**
 * The fades after the fog went from `before` to `after` at `now`: finished ones are
 * dropped, running ones that change direction start again from the cell's current look.
 * `motion` false (reduced motion) shows the change at once.
 */
export function startFades(
  fades: FogFades,
  before: CellSet,
  after: CellSet,
  now: number,
  motion = true,
): FogFades {
  if (!motion) return NO_FADES
  const diff = diffFog(before, after)
  if (diff.revealed.length === 0 && diff.hidden.length === 0) return fades
  const next = new Map<string, CellFade>()
  for (const [key, fade] of fades) if (now - fade.start < FOG_FADE_MS) next.set(key, fade)
  for (const key of diff.revealed) next.set(key, { start: now, reveal: true })
  for (const key of diff.hidden) next.set(key, { start: now, reveal: false })
  return next
}

/** The fog's opacity over a cell (0 to 1) at `now`, given whether it is hidden now. */
export function fogOpacity(hiddenNow: boolean, fade: CellFade | undefined, now: number): number {
  if (!fade) return hiddenNow ? 1 : 0
  const t = Math.min(1, Math.max(0, (now - fade.start) / FOG_FADE_MS))
  return fade.reveal ? 1 - t : t
}

/** Whether any fade still runs at `now`. */
export function fadesRunning(fades: FogFades, now: number): boolean {
  for (const fade of fades.values()) if (now - fade.start < FOG_FADE_MS) return true
  return false
}
