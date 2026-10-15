// Following icon and portrait jobs over the image hub (src/Server/Images/ImageHub.cs),
// the twin of the background watch (editor/background/watch.ts): connected only while one
// of the owner's versions is queued or running, and stopped as soon as none is left or the
// gallery closes, since an open connection keeps the scale-to-zero server awake
// (knowledge/decisions/hosting.md). Missed events are never replayed, so every successful
// WatchTokenImages asks for the list again.
import type { HubConnection } from '@microsoft/signalr'
import { useEffect, useRef } from 'react'
import type { TokenImage } from '../api/types'
import { invokeImageHub, onImageHubEvent } from '../editor/background/hub'
import { WATCH_RETRY_MS } from '../editor/background/watch'
import type { TokenImageOwner } from './queries'

export interface TokenImageWatchOptions {
  campaignId: string
  owner: TokenImageOwner
  createConnection: () => HubConnection
  /** A version moved on: running, done or failed. */
  onUpdate: (image: TokenImage) => void
  /** Watching (again): events may have been missed, so the list is fetched again. */
  onWatching: () => void
}

export class TokenImageWatch {
  private readonly options: TokenImageWatchOptions
  private connection: HubConnection | null = null
  private running = false
  /** Bumped whenever the current attempt or connection is abandoned. */
  private generation = 0
  private failures = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  /** WatchTokenImages said no: don't try again. */
  private refused = false

  constructor(options: TokenImageWatchOptions) {
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
    if (connection) void connection.stop().catch(() => {})
  }

  private async connect() {
    this.halt()
    if (!this.running || !navigator.onLine) return // onOnline() tries again
    const generation = this.generation
    const stale = () => generation !== this.generation
    const { campaignId, owner, createConnection, onUpdate, onWatching } = this.options
    const connection = createConnection()
    this.connection = connection
    onImageHubEvent(connection, 'TokenImageUpdated', (image) => {
      // The hub sends only this owner's group; the check guards against a mix-up.
      if (stale() || image.ownerId !== owner.id) return
      onUpdate(image)
    })
    connection.onclose(() => {
      if (!stale()) this.lost()
    })
    try {
      await connection.start()
      if (stale()) return
      const { error } = await invokeImageHub(
        connection,
        'WatchTokenImages',
        campaignId,
        owner.type,
        owner.id,
      )
      if (stale()) return
      if (error) {
        // Not allowed (any more) or no such owner: no point in trying again.
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
 * Watches the owner's jobs while `active` (a version is queued or running) and the
 * component is mounted; stops otherwise. The handlers may change on every render.
 */
export function useTokenImageWatch({
  active,
  ...options
}: TokenImageWatchOptions & { active: boolean }): void {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const { campaignId, createConnection } = options
  const { type, id } = options.owner
  useEffect(() => {
    if (!active) return
    const watch = new TokenImageWatch({
      campaignId,
      owner: { type, id },
      createConnection,
      onUpdate: (image) => latest.current.onUpdate(image),
      onWatching: () => latest.current.onWatching(),
    })
    watch.start()
    return () => watch.stop()
  }, [active, campaignId, type, id, createConnection])
}
