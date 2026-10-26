// What a spectator screen shows (knowledge/features/spectator-view.md, "The screen"), as pure
// functions of what the server tells it: the session's state from WatchSession, then
// EncounterStarted, EncounterEnded, SessionEnded and PlayModeChanged. Nothing here knows
// about connections, so the state machine is tested without a server.
import type { EncounterStartedEvent, PlayMode, WatchedSession } from '../api/types'

export interface ScreenModel {
  /** Null until the first answer to WatchSession. */
  session: WatchedSession | null
  /** The running fight the screen follows, if any. */
  encounterId: string | null
}

export const NO_SESSION: ScreenModel = { session: null, encounterId: null }

export type ScreenPhase =
  /** No answer yet. */
  | 'loading'
  /** "Noch nicht gestartet": the session is planned. */
  | 'planned'
  /** The session runs, but no fight: QR code and characters. */
  | 'waiting'
  /** A fight runs: the board. */
  | 'fight'
  /** "Sitzung beendet". */
  | 'ended'

export function phaseOf(model: ScreenModel): ScreenPhase {
  const { session } = model
  if (!session) return 'loading'
  if (session.status === 'ended') return 'ended'
  if (model.encounterId) return 'fight'
  return session.status === 'planned' ? 'planned' : 'waiting'
}

/** The server's answer to WatchSession (or the spectate endpoint): authoritative, also after a reconnect. */
export function watched(_model: ScreenModel, session: WatchedSession): ScreenModel {
  return { session, encounterId: session.status === 'active' ? session.activeEncounterId : null }
}

/** A fight starts, so the session is running (a planned session's screen only learns it here). */
export function encounterStarted(model: ScreenModel, event: EncounterStartedEvent): ScreenModel {
  if (!model.session || model.session.sessionId !== event.sessionId) return model
  return {
    session: { ...model.session, status: 'active', activeEncounterId: event.encounterId },
    encounterId: event.encounterId,
  }
}

/** A fight ended (an event about another fight than the followed one changes nothing). */
export function encounterEnded(model: ScreenModel, encounterId: string): ScreenModel {
  if (model.encounterId !== encounterId) return model
  return {
    session: model.session && { ...model.session, activeEncounterId: null },
    encounterId: null,
  }
}

export function sessionEnded(model: ScreenModel, sessionId: string): ScreenModel {
  if (!model.session || model.session.sessionId !== sessionId) return model
  return {
    session: { ...model.session, status: 'ended', activeEncounterId: null },
    encounterId: null,
  }
}

export function playModeChanged(model: ScreenModel, playMode: PlayMode): ScreenModel {
  return model.session ? { ...model, session: { ...model.session, playMode } } : model
}

/** Only while the session is in local mode does a shared screen get its controls. */
export function showsSharedControls(model: ScreenModel, sharedScreen: boolean): boolean {
  return sharedScreen && model.session?.playMode === 'local'
}

/** The screen keeps itself awake and connected while a session runs; planned or ended ones don't need it. */
export function keepsAwake(model: ScreenModel): boolean {
  return model.session?.status === 'active'
}
