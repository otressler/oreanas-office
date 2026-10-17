// The spectator screen's live state: the session connection (sessionWatch.ts) feeding the
// pure state machine (screenState.ts). The fight's own connection is useTable's; this
// hook hands it the `screen` that makes it call WatchSession before JoinEncounter.
import type { HubConnection } from '@microsoft/signalr'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiErrorCode } from '../api/types'
import { recheckServer } from '../server/serverStatus'
import { createTableConnection } from '../table/createConnection'
import { invokeHub } from '../table/hub'
import type { TableScreen } from '../table/useTable'
import { fetchWatchedSession } from './queries'
import {
  NO_SESSION,
  encounterEnded,
  encounterStarted,
  phaseOf,
  playModeChanged,
  sessionEnded,
  watched,
  type ScreenModel,
  type ScreenPhase,
} from './screenState'
import { SessionWatch, type WatchStatus } from './sessionWatch'

/** A planned session's screen looks again when touched, at most this often. */
export const REFRESH_EVERY_MS = 5_000

export interface SpectatorScreen {
  model: ScreenModel
  phase: ScreenPhase
  status: WatchStatus
  denied: ApiErrorCode | null
  /** Whether the connection is a shared screen now; false after a notLocalMode answer. */
  sharedScreen: boolean
  /** For useTable: calls WatchSession on the fight's connection. */
  screen: TableScreen
}

export function useSpectatorScreen(sessionId: string, sharedScreen: boolean): SpectatorScreen {
  const [model, setModel] = useState<ScreenModel>(NO_SESSION)
  const [status, setStatus] = useState<WatchStatus>('connecting')
  const [denied, setDenied] = useState<ApiErrorCode | null>(null)
  // A shared screen of a session that isn't in local mode only watches.
  const [fellBack, setFellBack] = useState(false)
  const sharedRef = useRef(sharedScreen)
  const [lastSession, setLastSession] = useState(sessionId)
  if (lastSession !== sessionId) {
    // Another session: forget the first one's state.
    setLastSession(sessionId)
    setModel(NO_SESSION)
    setDenied(null)
    setFellBack(false)
    setStatus('connecting')
  }

  useEffect(() => {
    sharedRef.current = sharedScreen
    const watch: SessionWatch = new SessionWatch({
      sessionId,
      sharedScreen,
      createConnection: createTableConnection,
      recheckServer,
      onStatus: setStatus,
      onWatched: (session) => {
        sharedRef.current = watch.sharedScreen
        setFellBack(sharedScreen && !watch.sharedScreen)
        setDenied(null)
        setModel((current) => watched(current, session))
      },
      onDenied: setDenied,
      onEncounterStarted: (started) => setModel((current) => encounterStarted(current, started)),
      onEncounterEnded: (encounterId) =>
        setModel((current) => encounterEnded(current, encounterId)),
      onSessionEnded: (id) => setModel((current) => sessionEnded(current, id)),
      onPlayModeChanged: (changed) =>
        setModel((current) => playModeChanged(current, changed.playMode)),
    })
    watch.start()
    return () => watch.dispose()
  }, [sessionId, sharedScreen])

  // A planned session's screen has no event for "the session started": a touch looks again.
  const phase = phaseOf(model)
  const lastRefresh = useRef(0)
  const planned = phase === 'planned'
  useEffect(() => {
    if (!planned) return
    const onTouch = () => {
      if (Date.now() - lastRefresh.current < REFRESH_EVERY_MS) return
      lastRefresh.current = Date.now()
      fetchWatchedSession(sessionId)
        .then((session) => setModel((current) => watched(current, session)))
        .catch(() => {})
    }
    window.addEventListener('pointerdown', onTouch, true)
    return () => window.removeEventListener('pointerdown', onTouch, true)
  }, [planned, sessionId])

  const beforeJoin = useCallback(
    async (connection: HubConnection): Promise<ApiErrorCode | null> => {
      let result = await invokeHub(connection, 'WatchSession', {
        sessionId,
        sharedScreen: sharedRef.current,
      })
      if (result.error === 'notLocalMode') {
        result = await invokeHub(connection, 'WatchSession', { sessionId, sharedScreen: false })
      }
      return result.error ?? null
    },
    [sessionId],
  )
  const screen = useMemo<TableScreen>(() => ({ beforeJoin }), [beforeJoin])

  return { model, phase, status, denied, sharedScreen: sharedScreen && !fellBack, screen }
}
