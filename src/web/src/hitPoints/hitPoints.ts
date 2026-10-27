// Hit points (knowledge/features/hit-points.md): the session DM's notes on creatures. A
// creature type has a default maximum, a placed creature may start with its own, and the
// current value is whatever the DM writes down; 0 doesn't kill anything. The server checks
// the same ranges (HitPointRules).
import type { BoardToken } from '../api/types'

export const MAX_MIN = 1
export const MAX_MAX = 999

/** Whether a maximum is a whole number from MAX_MIN to MAX_MAX. */
export function maxValid(max: number): boolean {
  return Number.isInteger(max) && max >= MAX_MIN && max <= MAX_MAX
}

/**
 * The card's two fields as hit points: what is left and the maximum. An empty "left" means
 * full. Null when either isn't a whole number in range.
 */
export function parseHitPoints(
  left: string,
  max: string,
): { hitPoints: number; maxHitPoints: number } | null {
  const maxHitPoints = Number(max.trim())
  if (max.trim() === '' || !maxValid(maxHitPoints)) return null
  const hitPoints = left.trim() === '' ? maxHitPoints : Number(left.trim())
  if (!Number.isInteger(hitPoints) || hitPoints < 0 || hitPoints > maxHitPoints) return null
  return { hitPoints, maxHitPoints }
}

/**
 * How much of the creature's maximum is gone, from 0 (unhurt) to 1 (none left): how high the
 * red fill rises in its token. Null for a token without hit points, which is every token on a
 * board other than the session DM's.
 */
export function damageShare(token: Pick<BoardToken, 'hitPoints' | 'maxHitPoints'>): number | null {
  const { hitPoints, maxHitPoints } = token
  if (hitPoints == null || maxHitPoints == null || maxHitPoints <= 0) return null
  return Math.min(1, Math.max(0, (maxHitPoints - hitPoints) / maxHitPoints))
}
