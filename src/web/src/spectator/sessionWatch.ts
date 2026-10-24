// A spectator screen's connection to its session (knowledge/features/spectator-view.md,
// "Connection and costs"): one SignalR connection that calls WatchSession and then hears
// EncounterStarted, EncounterEnded, SessionEnded and PlayModeChanged, whether or not a fight
// runs. The fight itself is followed by a second connection (useTable) that calls
// WatchSession again before JoinEncounter, so the board's live state is the players' own
// machinery. Lifecycle as in table/connection.ts: retries after 0, 1, 2, 5 s and then every
// 10 s, nothing while offline or in the background, "idle" after the server's IdleTimeout,
// MarkActive on input. Extra: after "Sitzung beendet" the screen disconnects ("closed") and
// connects again on the next touch, which also shows a continued session.
import type { HubConnection } from '@microsoft/signalr'
import type {
  ApiErrorCode,
  EncounterStartedEvent,
  PlayModeChangedEvent,
  WatchedSession,
} from '../api/types'
import { MARK_ACTIVE_EVERY_MS, reconnectDelay, type TableStatus } from '../table/connection'
import { invokeHub, onHubEvent } from '../table/hub'

export type WatchStatus =
  | TableStatus
  /** The session ended: disconnected until someone touches the screen. */
  | 'closed'
  /** The server says this account has no access to the session. */
  | 'denied'

export interface SessionWatchOptions {
  sessionId: string
  /** Open as a shared screen (local mode); falls back to a spectator screen when the session isn't local. */
  sharedScreen: boolean
  createConnection: () => HubConnection
  recheckServer: () => void
  onStatus: (status: WatchStatus) => void
  /** The session's state after every (re)connect; authoritative. */
  onWatched: (session: WatchedSession) => void
  onDenied: (error: ApiErrorCode) => void
  onEncounterStarted: (started: EncounterStartedEvent) => void
  onEncounterEnded: (encounterId: string) => void
  onSessionEnded: (sessionId: string) => void
  onPlayModeChanged: (changed: PlayModeChangedEvent) => void
}

export class SessionWatch {
  private state: WatchStatus = 'connecting'
  private connection: HubConnection | null = null
  private generation = 0
  private failures = 0
  private everWatched = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private lastActive = 0
  private running = false
  private shared: boolean
  private readonly options: SessionWatchOptions

  constructor(options: SessionWatchOptions) {
    this.options = options
    this.shared = options.sharedScreen
  }

  get status(): WatchStatus {
    return this.state
  }

  /** Whether the screen is asked for as a shared screen now (a notLocalMode answer turns it off). */
  get sharedScreen(): boolean {
    return this.shared
  }

  start(): void {
    if (this.running) return
    this.running = true
    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.onOffline)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('pointerdown', this.onPointerDown, true)
    window.addEventListener('keydown', this.onKeyDown, true)
    if (document.hidden) this.setStatus('paused')
    else void this.connect()
  }

  dispose(): void {
    if (!this.running) return
    this.running = false
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOffline)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('pointerdown', this.onPointerDown, true)
    window.removeEventListener('keydown', this.onKeyDown, true)
    this.halt()
  }

  /** Disconnects without a retry: the session ended. A touch connects again. */
  close(): void {
    this.halt()
    this.setStatus('closed')
  }

  private setStatus(status: WatchStatus) {
    if (status === this.state) return
    this.state = status
    this.options.onStatus(status)
  }

  private halt() {
    this.generation += 1
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const connection = this.connection
    this.connection = null
    if (connection) void connection.stop().catch(() => {})
  }

  private async connect() {
    this.halt()
    if (!this.running) return
    if (!navigator.onLine) {
      this.setStatus('offline')
      return
    }
    const generation = this.generation
    const stale = () => generation !== this.generation
    this.setStatus(this.everWatched ? 'reconnecting' : 'connecting')

    const connection = this.options.createConnection()
    this.connection = connection
    onHubEvent(connection, 'EncounterStarted', (started) => {
      if (!stale()) this.options.onEncounterStarted(started)
    })
    onHubEvent(connection, 'EncounterEnded', (encounterId) => {
      if (!stale()) this.options.onEncounterEnded(encounterId)
    })
    onHubEvent(connection, 'SessionEnded', (sessionId) => {
      if (stale()) return
      this.options.onSessionEnded(sessionId)
      this.close()
    })
    onHubEvent(connection, 'PlayModeChanged', (changed) => {
      if (!stale()) this.options.onPlayModeChanged(changed)
    })
    onHubEvent(connection, 'IdleTimeout', () => {
      if (stale()) return
      this.halt()
      this.setStatus('idle')
    })
    connection.onclose(() => {
      if (!stale()) this.lost(this.state !== 'connected')
    })

    let result
    try {
      await connection.start()
      if (stale()) return
      result = await invokeHub(connection, 'WatchSession', {
        sessionId: this.options.sessionId,
        sharedScreen: this.shared,
      })
      if (!stale() && result.error === 'notLocalMode' && this.shared) {
        // The session left local mode: this device only watches, like a spectator screen.
        this.shared = false
        result = await invokeHub(connection, 'WatchSession', {
          sessionId: this.options.sessionId,
          sharedScreen: false,
        })
      }
    } catch {
      if (!stale()) this.lost(true)
      return
    }
    if (stale()) return
    if (result.error || !result.session) {
      this.halt()
      this.setStatus('denied')
      this.options.onDenied(result.error ?? 'tokenNotFound')
      return
    }
    this.failures = 0
    this.everWatched = true
    this.lastActive = Date.now()
    this.setStatus('connected')
    this.options.onWatched(result.session)
    // A continued session's screen finds it ended again: nothing more to hear.
    if (result.session.status === 'ended') this.close()
  }

  private lost(failedAttempt: boolean) {
    this.halt()
    if (!this.running) return
    this.failures += 1
    if (!navigator.onLine) {
      this.setStatus('offline')
      return
    }
    this.setStatus(this.everWatched ? 'reconnecting' : 'connecting')
    if (failedAttempt) this.options.recheckServer()
    this.retryTimer = setTimeout(() => void this.connect(), reconnectDelay(this.failures))
  }

  private resume() {
    this.failures = 0
    void this.connect()
  }

  private onOnline = () => {
    if (this.state === 'offline') this.resume()
  }

  private onOffline = () => {
    if (this.state === 'paused' || this.state === 'idle' || this.state === 'closed') return
    this.halt()
    this.setStatus('offline')
  }

  private onVisibilityChange = () => {
    if (document.hidden) {
      if (this.state === 'closed' || this.state === 'denied') return
      this.halt()
      this.setStatus('paused')
    } else if (this.state === 'paused' || this.state === 'idle') {
      this.resume()
    }
  }

  private onPointerDown = () => {
    if (this.state === 'idle' || this.state === 'closed') {
      this.resume()
      return
    }
    if (this.state !== 'connected' || !this.connection) return
    if (Date.now() - this.lastActive < MARK_ACTIVE_EVERY_MS) return
    this.lastActive = Date.now()
    invokeHub(this.connection, 'MarkActive').catch(() => {})
  }

  private onKeyDown = () => {
    if (this.state === 'idle' || this.state === 'closed') this.resume()
  }
}
