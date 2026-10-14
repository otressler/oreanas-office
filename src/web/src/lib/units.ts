// Units (knowledge/rules/movement-distance.md): distances are whole squares
// internally and only become meters for display. One square is 1.5 m. Never feet.
import { de } from '../text/de'
import { limits } from './limits'

/** Length of one grid square in meters. A fixed constant, not a per-map setting. */
export const SQUARE_METERS = 1.5

/** Squares to meters, e.g. 5 → 7.5. */
export function squaresToMeters(squares: number): number {
  return squares * SQUARE_METERS
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

const elevationInputNumber = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
  useGrouping: false,
})

/** An elevation as the value of an input field, without unit: 1.5 → "1,5", -3 → "-3". */
export function formatElevationInput(meters: number): string {
  return elevationInputNumber.format(Math.round(meters * 10) / 10 + 0)
}

/**
 * An elevation as typed: "1,5", "1.5", "-3", "−1,5", "+3" or "2,5 m", with at most one
 * decimal. Null for anything else and for heights at or beyond limits.elevation.
 */
export function parseElevationInput(input: string): number | null {
  const normalized = input.trim().replace(/\s*m$/i, '').replace(/^[−–]/, '-').replace(',', '.')
  if (!/^[+-]?(\d+(\.\d?)?|\.\d)$/.test(normalized)) return null
  const value = Math.round(Number(normalized) * 10) / 10 + 0
  return Math.abs(value) < limits.elevation ? value : null
}
