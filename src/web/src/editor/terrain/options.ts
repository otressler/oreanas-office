// The choices the terrain and elevation tools share: which terrain they paint and
// which elevation. Kept for the whole app session, so they survive switching tools
// and maps; they aren't part of the map and aren't undone.
import { create } from 'zustand'
import type { Terrain } from '../../api/types'

/** The terrain choices in panel order; digits 1–5 pick them. */
export const TERRAIN_CHOICES: readonly Terrain[] = ['floor', 'difficult', 'water', 'wall', 'void']

/** The elevation panel's quick values in meters; digits 1–5 pick them. */
export const ELEVATION_QUICK: readonly number[] = [-3, -1.5, 0, 1.5, 3]

interface PaintOptions {
  terrain: Terrain
  /** Meters, one decimal. */
  elevation: number
  setTerrain(terrain: Terrain): void
  setElevation(meters: number): void
}

export const usePaintOptions = create<PaintOptions>()((set) => ({
  terrain: 'floor',
  elevation: 1.5,
  setTerrain: (terrain) => set({ terrain }),
  setElevation: (elevation) => set({ elevation }),
}))

/** Back to the defaults, for tests. */
export function resetPaintOptions() {
  usePaintOptions.setState({ terrain: 'floor', elevation: 1.5 })
}

/** The choice a digit key picks from a list of five ("1" → the first), if any. */
export function pickByDigit<T>(choices: readonly T[], key: string): T | undefined {
  if (!/^[1-9]$/.test(key)) return undefined
  return choices[Number(key) - 1]
}
