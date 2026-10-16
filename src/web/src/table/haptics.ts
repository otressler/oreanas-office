// Haptic feedback (knowledge/features/player-extras.md, "Haptic feedback"): one short
// vibration when the server has taken this device's move or undo, two short pulses when
// it rejects a move. Only the mover's device; nothing for others' moves, pings or statuses.
// Through navigator.vibrate, which iPhones and iPads don't have: there it is silent. The
// "Vibrieren" switch on the profile page is remembered on this device, on by default.
//
// Stage 9 contract: the interface is final; the board renderer lane fills in the bodies.

export type Haptic = 'taken' | 'rejected'

/** Vibrates for a move's outcome, if the device can and the person hasn't switched it off. */
export function vibrate(haptic: Haptic): void {
  void haptic
}

/** Whether this device vibrates at all (the Vibration API exists). */
export function canVibrate(): boolean {
  return false
}

/** The "Vibrieren" switch: on unless switched off on this device. */
export function vibrationEnabled(): boolean {
  return true
}

export function setVibrationEnabled(on: boolean): void {
  void on
}
