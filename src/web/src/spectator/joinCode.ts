// Join codes and sessions on the join page (knowledge/features/spectator-view.md).
import type { JoinableSession } from '../api/types'

/** What a person typed or scanned: case, spaces and dashes don't matter (as on the server). */
export function cleanJoinCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

/** The session the picker starts on: the running one, else the first planned one. */
export function defaultSession(sessions: JoinableSession[]): string {
  return (sessions.find((session) => session.status === 'active') ?? sessions[0])?.id ?? ''
}
