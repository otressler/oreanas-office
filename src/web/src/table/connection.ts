// The live table's connection lifecycle (knowledge/decisions/realtime-sync.md,
// knowledge/decisions/hosting.md): one SignalR connection per open fight page, with
// reconnects managed here instead of SignalR's automatic reconnect, so that:
// - every (re)connect joins the encounter, then reloads the board; missed events are
//   never replayed;
// - the app in the background closes its connection ("paused") and reconnects when
//   it is visible again, so a forgotten phone doesn't keep the server awake;
// - a lost connection is retried after 0 s, 1 s, 2 s, 5 s, then every 10 s, and not
//   at all while the device is offline (it waits for the `online` event);
// - a failed attempt asks the server gate to probe /api/health again: the server may
//   be cold-starting, and the gate then shows the waking screen;
// - after the server's IdleTimeout the device stays "idle" until the person touches
//   the screen, presses a key or brings the app back;
// - the person's pointer input tells the server they are still there (MarkActive), at
//   most once a minute.
// The connection factory is injected, so tests run without a server.
import type { HubConnection } from '@microsoft/signalr'
import type { ApiErrorCode, MoveResult, MoveTokenRequest, TokenMovedEvent } from '../api/types'
import { invokeHub, onHubEvent } from './hub'

export type TableStatus =
  /** The first connection is on its way. */
  | 'connecting'
  /** Joined the encounter: moves go through. The only state that allows moving. */
  | 'connected'
  /** The connection was lost; trying again. */
  | 'reconnecting'
  /** The device has no network; waiting for it to come back. */
  | 'offline'
  /** The app is in the background; reconnects when it is visible again. */
  | 'paused'
  /** The server dropped the idle connection; reconnects on the person's next input. */
  | 'idle'

/** Waits before the 1st, 2nd, 3rd and 4th attempt after a loss; then RECONNECT_EVERY_MS. */
export const RECONNECT_DELAYS_MS = [0, 1_000, 2_000, 5_000] as const
export const RECONNECT_EVERY_MS = 10_000
/** MarkActive at most this often. */
export const MARK_ACTIVE_EVERY_MS = 60_000

/** The wait before attempt number `failures` (1-based) after a lost connection. */
export function reconnectDelay(failures: number): number {
  return RECONNECT_DELAYS_MS[failures - 1] ?? RECONNECT_EVERY_MS
}

export interface TableConnectionOptions {
  encounterId: string
  createConnection: () => HubConnection
  /** Probes the server again (server/serverStatus.ts recheckServer). */
  recheckServer: () => void
  onStatus: (status: TableStatus) => void
  /** Joined (again): reload the board. */
  onJoined: () => void
  onMoved: (move: TokenMovedEvent) => void
  /** The fight is over: reload the board, which then says so. */
  onEnded: () => void
  /** JoinEncounter said no (encounterNotActive, tokenNotFound): reload the board. */
  onRejected: (error: ApiErrorCode) => void
}

/** A move or undo while the table isn't connected; moves are never queued. */
export class NotConnectedError extends Error {
  constructor() {
    super('The table is not connected')
    this.name = 'NotConnectedError'
  }
}

export class TableConnection {
  private state: TableStatus = 'connecting'
  private connection: HubConnection | null = null
  private joined = false
  /** Bumped whenever the current attempt or connection is abandoned. */
  private generation = 0
  private failures = 0
  private everJoined = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private lastActive = 0
  private running = false
  private readonly options: TableConnectionOptions

  constructor(options: TableConnectionOptions) {
    this.options = options
  }

  get status(): TableStatus {
    return this.state
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

  /** Sends a move. Rejects with NotConnectedError unless connected. */
  move(request: MoveTokenRequest): Promise<MoveResult> {
    const connection = this.activeConnection()
    if (!connection) return Promise.reject(new NotConnectedError())
    return invokeHub(connection, 'MoveToken', request)
  }

  /** Puts back the person's last move. Rejects with NotConnectedError unless connected. */
  undo(): Promise<MoveResult> {
    const connection = this.activeConnection()
    if (!connection) return Promise.reject(new NotConnectedError())
    return invokeHub(connection, 'UndoMove', this.options.encounterId)
  }

  private activeConnection(): HubConnection | null {
    if (this.state !== 'connected' || !this.connection) return null
    // Any call resets the server's idle timer.
    this.lastActive = Date.now()
    return this.connection
  }

  private setStatus(status: TableStatus) {
    if (status === this.state) return
    this.state = status
    this.options.onStatus(status)
  }

  /** Abandons the current attempt or connection and any planned retry. */
  private halt() {
    this.generation += 1
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const connection = this.connection
    this.connection = null
    this.joined = false
    // Its onclose sees a newer generation and does nothing.
    if (connection) void connection.stop().catch(() => {})
  }

  private async connect() {
    this.halt()
    if (!this.running) return
    if (!navigator.onLine) {
      this.setStatus('offline')
      return // onOnline() tries again
    }
    const generation = this.generation
    const stale = () => generation !== this.generation
    this.setStatus(this.everJoined ? 'reconnecting' : 'connecting')

    const { createConnection, encounterId, onMoved, onEnded } = this.options
    const connection = createConnection()
    this.connection = connection
    onHubEvent(connection, 'TokenMoved', (move) => {
      if (!stale()) onMoved(move)
    })
    onHubEvent(connection, 'EncounterEnded', () => {
      if (!stale()) onEnded()
    })
    onHubEvent(connection, 'IdleTimeout', () => {
      if (stale()) return
      this.halt()
      this.setStatus('idle')
    })
    connection.onclose(() => {
      if (!stale()) this.lost(!this.joined)
    })

    let error: ApiErrorCode | null
    try {
      await connection.start()
      if (stale()) return
      error = (await invokeHub(connection, 'JoinEncounter', encounterId)).error
    } catch {
      if (!stale()) this.lost(true)
      return
    }
    if (stale()) return
    if (error) {
      // The fight isn't running (any more): the reloaded board says so. Don't retry
      // on a timer; the person's next input or a return to the app tries again.
      this.halt()
      this.setStatus('idle')
      this.options.onRejected(error)
      return
    }
    this.failures = 0
    this.everJoined = true
    this.joined = true
    this.lastActive = Date.now()
    this.setStatus('connected')
    this.options.onJoined()
  }

  /** The connection dropped (`failedAttempt`: or never got going). Tries again after a pause. */
  private lost(failedAttempt: boolean) {
    this.halt()
    if (!this.running) return
    this.failures += 1
    if (!navigator.onLine) {
      this.setStatus('offline')
      return
    }
    this.setStatus(this.everJoined ? 'reconnecting' : 'connecting')
    // The server may have scaled to zero; if so, the gate shows the waking screen and
    // this page remounts once the server is up.
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
    if (this.state === 'paused' || this.state === 'idle') return
    this.halt()
    this.setStatus('offline')
  }

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.halt()
      this.setStatus('paused')
    } else if (this.state === 'paused' || this.state === 'idle') {
      this.resume()
    }
  }

  private onPointerDown = () => {
    if (this.state === 'idle') {
      this.resume()
      return
    }
    if (this.state !== 'connected' || !this.connection) return
    if (Date.now() - this.lastActive < MARK_ACTIVE_EVERY_MS) return
    this.lastActive = Date.now()
    invokeHub(this.connection, 'MarkActive').catch(() => {
      // A lost connection shows up through onclose.
    })
  }

  private onKeyDown = () => {
    if (this.state === 'idle') this.resume()
  }
}
