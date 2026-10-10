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
