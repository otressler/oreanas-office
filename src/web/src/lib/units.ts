// Units (knowledge/rules/movement-distance.md): distances are whole squares
// internally and only become meters for display. One square is 1.5 m. Never feet.
import { de } from '../text/de'

/** Length of one grid square in meters. A fixed constant, not a per-map setting. */
export const SQUARE_METERS = 1.5

/** Squares to meters, e.g. 5 → 7.5. */
export function squaresToMeters(squares: number): number {
  return squares * SQUARE_METERS
}

/**
 * Meters to whole squares, e.g. 9 → 6 and 7.5 → 5. A remainder smaller than a
 * square is dropped (10 m → 6 squares), since a partial square can't be entered.
 */
export function metersToSquares(meters: number): number {
  // The epsilon absorbs floating-point noise such as 4.5 / 1.5 = 2.9999…
  return Math.floor(meters / SQUARE_METERS + 1e-9)
}

const meterNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** A distance given in squares, shown in meters: 5 → "7,5 m", 6 → "9 m". */
export function formatMeters(squares: number): string {
  return de.units.meters(meterNumber.format(squaresToMeters(squares)))
}

/**
 * An elevation in meters, e.g. 1.5 → "1,5 m", 0 → "0 m". Unlike distances it isn't
 * tied to whole squares (knowledge/domain/battle-map.md); one decimal is shown.
 */
export function formatElevation(meters: number): string {
  // Adding 0 turns -0 into 0, so a tiny negative value never shows as "-0 m".
  const rounded = Math.round(meters * 10) / 10 + 0
  return de.units.meters(meterNumber.format(rounded))
}

const meterInputNumber = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
  useGrouping: false,
})

/** Squares as the value of a meter input field, without unit: 5 → "7,5". */
export function formatMetersInput(squares: number): string {
  return meterInputNumber.format(squaresToMeters(squares))
}

/**
 * Meters as typed by a person: "9", "7,5", "7.5" or "7,5 m". Returns null for
 * anything that isn't a non-negative number. Rounding to squares is separate
 * (metersToSquares), so a form can say what the value will become.
 */
export function parseMeters(input: string): number | null {
  const normalized = input.trim().replace(/\s*m$/i, '').replace(',', '.')
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null
  return Number(normalized)
}

/** True when the meters are a whole number of squares, so nothing is rounded off. */
export function isWholeSquares(meters: number): boolean {
  return Math.abs(squaresToMeters(metersToSquares(meters)) - meters) < 1e-9
}
