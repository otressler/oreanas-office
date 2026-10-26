// The device remembers that it is a session's spectator screen, so reopening the app brings
// it back until someone leaves the view (knowledge/features/spectator-view.md, "The screen").
// localStorage may be missing or full (private windows), so every access is guarded.
import { spectatorPath } from '../sessions/paths'

const KEY = 'oreanas.spectatorScreen'

/** A forgotten tablet doesn't take over the app for ever: the memory fades after this long. */
export const REMEMBER_MS = 3 * 24 * 60 * 60 * 1000

export interface RememberedScreen {
  userId: string
  campaignId: string
  sessionId: string
  /** Opened as a shared screen (local mode). */
  sharedScreen: boolean
  /** For a session spectator's way back to the join page; members don't need it. */
  joinCode: string | null
  /** When the screen was last opened, ms since the epoch. */
  at: number
}

export function rememberScreen(screen: Omit<RememberedScreen, 'at'>, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...screen, at: now } satisfies RememberedScreen))
  } catch {
    // No storage: the screen just isn't brought back.
  }
}

export function forgetScreen(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}

/** What the device remembers, whoever it was for. */
export function rememberedScreen(): RememberedScreen | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const screen = parsed as Partial<RememberedScreen>
    if (
      typeof screen.userId !== 'string' ||
      typeof screen.campaignId !== 'string' ||
      typeof screen.sessionId !== 'string' ||
      typeof screen.at !== 'number'
    ) {
      return null
    }
    return {
      userId: screen.userId,
      campaignId: screen.campaignId,
      sessionId: screen.sessionId,
      sharedScreen: screen.sharedScreen === true,
      joinCode: typeof screen.joinCode === 'string' ? screen.joinCode : null,
      at: screen.at,
    }
  } catch {
    return null
  }
}

/** The screen to bring back for this person now, or null. */
export function screenToResume(userId: string, now = Date.now()): RememberedScreen | null {
  const screen = rememberedScreen()
  return screen && screen.userId === userId && now - screen.at < REMEMBER_MS ? screen : null
}

/** The shared screen is the same route with ?gemeinsam=1. */
export function screenPath(
  screen: Pick<RememberedScreen, 'campaignId' | 'sessionId' | 'sharedScreen'>,
): string {
  const path = spectatorPath(screen.campaignId, screen.sessionId)
  return screen.sharedScreen ? `${path}?gemeinsam=1` : path
}
