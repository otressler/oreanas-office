// Haptic feedback (knowledge/features/player-extras.md, "Haptic feedback"): one short
// vibration when the server has taken this device's move or undo, two short pulses when
// it rejects a move. Only the mover's device; nothing for others' moves, pings or statuses.
// Through navigator.vibrate, which iPhones and iPads don't have: there it is silent. The
// "Vibrieren" switch on the profile page is remembered on this device, on by default.

export type Haptic = 'taken' | 'rejected'

/** Vibration patterns in milliseconds: one short buzz, or two with a pause between. */
export const HAPTIC_PATTERNS: Record<Haptic, number | number[]> = {
  taken: 30,
  rejected: [30, 80, 30],
}

const KEY = 'oreana.vibrate'

/** Vibrates for a move's outcome, if the device can and the person hasn't switched it off. */
export function vibrate(haptic: Haptic): void {
  if (!canVibrate() || !vibrationEnabled()) return
  try {
    navigator.vibrate(HAPTIC_PATTERNS[haptic])
  } catch {
    // Some browsers throw when vibrating isn't allowed right now; it's only a nicety.
  }
}

/** Whether this device vibrates at all (the Vibration API exists). */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** The "Vibrieren" switch: on unless switched off on this device. */
export function vibrationEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setVibrationEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    // Without storage the switch can't be remembered; vibrating stays on.
  }
}
