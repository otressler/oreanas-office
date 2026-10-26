import { describe, expect, it } from 'vitest'
import type { WatchedSession } from '../api/types'
import {
  NO_SESSION,
  encounterEnded,
  encounterStarted,
  keepsAwake,
  phaseOf,
  playModeChanged,
  sessionEnded,
  showsSharedControls,
  watched,
} from './screenState'

const S = 's1'
const E = 'e1'

function session(fields: Partial<WatchedSession> = {}): WatchedSession {
  return {
    sessionId: S,
    campaignId: 'c1',
    title: 'Die Seilbrücke',
    date: '2026-10-17',
    status: 'active',
    playMode: 'byod',
    activeEncounterId: null,
    characters: [],
    ...fields,
  }
}

describe('the spectator screen', () => {
  it('waits for the first answer', () => {
    expect(phaseOf(NO_SESSION)).toBe('loading')
  })

  it('shows the phase of the session it is told about', () => {
    expect(phaseOf(watched(NO_SESSION, session({ status: 'planned' })))).toBe('planned')
    expect(phaseOf(watched(NO_SESSION, session()))).toBe('waiting')
    expect(phaseOf(watched(NO_SESSION, session({ activeEncounterId: E })))).toBe('fight')
    expect(phaseOf(watched(NO_SESSION, session({ status: 'ended' })))).toBe('ended')
  })

  it('follows a fight from its start to its end, by itself', () => {
    let model = watched(NO_SESSION, session())
    model = encounterStarted(model, { sessionId: S, encounterId: E })
    expect(phaseOf(model)).toBe('fight')
    expect(model.encounterId).toBe(E)

    model = encounterEnded(model, E)
    expect(phaseOf(model)).toBe('waiting')
    expect(model.session?.activeEncounterId).toBeNull()
  })

  it('learns from the first fight that a planned session is running', () => {
    const model = encounterStarted(watched(NO_SESSION, session({ status: 'planned' })), {
      sessionId: S,
      encounterId: E,
    })
    expect(model.session?.status).toBe('active')
    expect(phaseOf(model)).toBe('fight')
  })

  it('ignores events about another fight or session', () => {
    const fighting = watched(NO_SESSION, session({ activeEncounterId: E }))
    expect(encounterEnded(fighting, 'other')).toBe(fighting)
    expect(encounterStarted(fighting, { sessionId: 'other', encounterId: 'x' })).toBe(fighting)
    expect(sessionEnded(fighting, 'other')).toBe(fighting)
  })

  it('ends with the session, fight or not', () => {
    const model = sessionEnded(watched(NO_SESSION, session({ activeEncounterId: E })), S)
    expect(phaseOf(model)).toBe('ended')
    expect(model.encounterId).toBeNull()
  })

  it('takes the server’s word after a reconnect, also against what it believed', () => {
    const believed = encounterStarted(watched(NO_SESSION, session()), {
      sessionId: S,
      encounterId: E,
    })
    // The fight ended while the connection was down.
    expect(phaseOf(watched(believed, session()))).toBe('waiting')
    // A session continued after it ended shows again.
    expect(phaseOf(watched(sessionEnded(believed, S), session({ activeEncounterId: 'e2' })))).toBe(
      'fight',
    )
  })

  it('gives a shared screen its controls only in local mode', () => {
    const model = watched(NO_SESSION, session())
    expect(showsSharedControls(model, true)).toBe(false)
    expect(showsSharedControls(playModeChanged(model, 'local'), true)).toBe(true)
    expect(showsSharedControls(playModeChanged(model, 'local'), false)).toBe(false)
    expect(showsSharedControls(playModeChanged(model, 'byod'), true)).toBe(false)
  })

  it('keeps itself awake only while the session runs', () => {
    expect(keepsAwake(watched(NO_SESSION, session()))).toBe(true)
    expect(keepsAwake(watched(NO_SESSION, session({ status: 'planned' })))).toBe(false)
    expect(keepsAwake(watched(NO_SESSION, session({ status: 'ended' })))).toBe(false)
    expect(keepsAwake(NO_SESSION)).toBe(false)
  })
})
