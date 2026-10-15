// Following background jobs over the image hub (src/Server/Images/ImageHub.cs). The editor
// connects only while one of its map's jobs is queued or running, and stops as soon as none
// is left or the panel closes: an open connection keeps the scale-to-zero server awake
// (knowledge/decisions/hosting.md). Events missed while (re)connecting are never replayed,
// so every successful WatchMap asks for the list again.
import type { HubConnection } from '@microsoft/signalr'
import { useEffect, useRef } from 'react'
import type { MapBackground } from '../../api/types'
import { invokeImageHub, onImageHubEvent } from './hub'

/** Waits before the 1st, 2nd, 3rd attempt after a loss; then the last one again. */
export const WATCH_RETRY_MS = [1_000, 3_000, 10_000] as const

export interface BackgroundWatchOptions {
  campaignId: string
  mapId: string
  createConnection: () => HubConnection
  /** A version moved on: running, done or failed. */
  onUpdate: (background: MapBackground) => void
  /** Watching (again): events may have been missed, so the list is fetched again. */
  onWatching: () => void
}

export class BackgroundWatch {
  private readonly options: BackgroundWatchOptions
  private connection: HubConnection | null = null
  private running = false
  /** Bumped whenever the current attempt or connection is abandoned. */
  private generation = 0
  private failures = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  /** WatchMap said no: don't try again. */
  private refused = false

  constructor(options: BackgroundWatchOptions) {
    this.options = options
  }

  /** Whether a connection is open or on its way. */
  get connected(): boolean {
    return this.connection !== null
  }

  start(): void {
    if (this.running) return
    this.running = true
    window.addEventListener('online', this.onOnline)
    void this.connect()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    window.removeEventListener('online', this.onOnline)
    this.halt()
  }

  private halt() {
    this.generation += 1
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    const connection = this.connection
    this.connection = null
    // Its onclose sees a newer generation and does nothing.
    if (connection) void connection.stop().catch(() => {})
  }

  private async connect() {
    this.halt()
    if (!this.running || !navigator.onLine) return // onOnline() tries again
    const generation = this.generation
    const stale = () => generation !== this.generation
    const { campaignId, mapId, createConnection, onUpdate, onWatching } = this.options
    const connection = createConnection()
    this.connection = connection
    onImageHubEvent(connection, 'BackgroundUpdated', (background) => {
      // The hub sends only this map's group. Versions are matched by id, never by mapId: a
      // store copy lists its source's picked version, whose mapId is the source map.
      if (!stale()) onUpdate(background)
    })
    connection.onclose(() => {
      if (!stale()) this.lost()
    })
    try {
      await connection.start()
      if (stale()) return
      const { error } = await invokeImageHub(connection, 'WatchMap', campaignId, mapId)
      if (stale()) return
      if (error) {
        // Not a dm (any more) or no such map: no point in trying again. The list says the rest.
        this.refused = true
        this.halt()
        onWatching()
        return
      }
    } catch {
      if (!stale()) this.lost()
      return
    }
    this.failures = 0
    onWatching()
  }

  private lost() {
    this.halt()
    if (!this.running || !navigator.onLine) return
    this.failures += 1
    const delay = WATCH_RETRY_MS[Math.min(this.failures, WATCH_RETRY_MS.length) - 1]
    this.retryTimer = setTimeout(() => void this.connect(), delay)
  }

  private onOnline = () => {
    if (this.running && !this.refused && !this.connection && this.retryTimer === undefined) {
      this.failures = 0
      void this.connect()
    }
  }
}

/**
 * Watches the map's jobs while `active` (a version is queued or running) and the component
 * is mounted; stops otherwise. The handlers may change on every render.
 */
export function useBackgroundWatch({
  active,
  ...options
}: BackgroundWatchOptions & { active: boolean }): void {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const { campaignId, mapId, createConnection } = options
  useEffect(() => {
    if (!active) return
    const watch = new BackgroundWatch({
      campaignId,
      mapId,
      createConnection,
      onUpdate: (background) => latest.current.onUpdate(background),
      onWatching: () => latest.current.onWatching(),
    })
    watch.start()
    return () => watch.stop()
  }, [active, campaignId, mapId, createConnection])
}
