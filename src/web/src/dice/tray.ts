// Each person has one dice tray on this device, kept while the app is open, so the dice,
// modifier and mode are still there when the dialog opens again, on another page too.
// "Letzte Würfe" also survive a reload (history.ts).
import { defineDiceRoller, type DiceRoller } from './diceRoller'
import { loadDiceHistory, saveDiceHistory } from './history'

let shared: { userId: string; roller: DiceRoller } | null = null

/** The person's tray, made on first use with the rolls kept on this device. */
export function trayFor(userId: string): DiceRoller {
  if (shared?.userId !== userId) {
    defineDiceRoller()
    const roller = document.createElement('dice-roller') as unknown as DiceRoller
    roller.setAttribute('bare', '')
    roller.history = loadDiceHistory(userId)
    roller.addEventListener('dice-roll', () => saveDiceHistory(userId, roller.history))
    shared = { userId, roller }
  }
  return shared.roller
}

/** Tests start each case with a fresh tray. */
export function forgetDiceTray(): void {
  shared = null
}
