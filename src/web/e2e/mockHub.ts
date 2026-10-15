// A stand-in for the table hub (/hubs/table) next to MockBackend, speaking SignalR's
// JSON protocol over Playwright's WebSocket routing, so the app's real
// @microsoft/signalr client runs unchanged:
// - negotiate is an HTTP POST to /hubs/table/negotiate?negotiateVersion=1;
// - the socket opens with the handshake {"protocol":"json","version":1}, answered {};
// - invocations are type 1 with an invocationId, answered by completions (type 3);
//   server messages are type 1 without one; pings are type 6. Records end with \u001e.
// Moves and undos are checked by MockBackend; confirmed ones go to every device
// joined to the encounter, as the real hub broadcasts them.
import { randomUUID } from 'node:crypto'
import type { BrowserContext, WebSocketRoute } from '@playwright/test'
import type { components } from '../src/api/schema.js'
import type { MockBackend } from './mockBackend.ts'

type S = components['schemas']

const RS = '\u001e'

interface Client {
  context: BrowserContext
  socket: WebSocketRoute
  handshaken: boolean
  encounterId: string | null
}

interface Message {
  type: number
  invocationId?: string
  target?: string
  arguments?: unknown[]
}

export interface HubCall {
  context: BrowserContext
  method: string
  args: unknown[]
}

export class MockHub {
  readonly calls: HubCall[] = []
  /** While true, new connections fail at negotiate (503), like a server that's away. */
  down = false
  /** When set, every MoveToken is turned down with this code instead of being checked. */
  refuseMoves: S['ApiErrorCode'] | null = null
  private readonly clients = new Set<Client>()
  private readonly backend: MockBackend

  constructor(backend: MockBackend) {
    this.backend = backend
  }

  /** Answers the hub for this context's pages. */
  async attach(context: BrowserContext) {
    await context.route('**/hubs/table/negotiate*', (route) => {
      if (this.down) return route.fulfill({ status: 503 })
      const id = randomUUID()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          negotiateVersion: 1,
          connectionId: id,
          connectionToken: id,
          availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
        }),
      })
    })
    await context.routeWebSocket(/\/hubs\/table(\?|$)/, (socket) => this.accept(context, socket))
  }

  /** Devices joined to an encounter right now, optionally only one context's. */
  joined(context?: BrowserContext): number {
    return [...this.clients].filter((c) => c.encounterId && (!context || c.context === context))
      .length
  }

  /** The calls of one hub method. */
  callsOf(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args)
  }

  /** Someone moves a token from another device: checked, saved and sent to everyone. */
  move(userId: string, tokenId: string, x: number, y: number): S['TokenMovedEvent'] {
    const result = this.backend.moveToken(userId, { tokenId, x, y })
    if (!result.move) throw new Error(`Move refused: ${result.error}`)
    this.broadcast(result.move)
    return result.move
  }

  /** Drops every connection; with `down` they can't come back until it is false again. */
  dropAll({ down = true } = {}) {
    this.down = down
    for (const client of this.clients) void client.socket.close()
  }

  /** The server's idle timeout for one context's devices: the message, then the drop. */
  idleTimeout(context: BrowserContext) {
    for (const client of this.clients) {
      if (client.context !== context) continue
      this.send(client, { type: 1, target: 'IdleTimeout', arguments: [] })
      void client.socket.close()
    }
  }

  private accept(context: BrowserContext, socket: WebSocketRoute) {
    const client: Client = { context, socket, handshaken: false, encounterId: null }
    this.clients.add(client)
    socket.onClose(() => this.clients.delete(client))
    socket.onMessage((data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8')
      for (const record of text.split(RS)) {
        if (record) this.receive(client, JSON.parse(record) as Message)
      }
    })
  }

  private receive(client: Client, message: Message) {
    if (!client.handshaken) {
      // {"protocol":"json","version":1}
      client.handshaken = true
      client.socket.send(`{}${RS}`)
      return
    }
    if (message.type === 6) return this.send(client, { type: 6 })
    if (message.type !== 1 || !message.target) return

    const userId = this.backend.userId(client.context)
    const args = message.arguments ?? []
    this.calls.push({ context: client.context, method: message.target, args })
    let result: unknown
    switch (message.target) {
      case 'JoinEncounter': {
        const encounterId = String(args[0])
        result = this.backend.joinEncounter(userId, encounterId)
        if (!(result as S['HubResult']).error) client.encounterId = encounterId
        break
      }
      case 'MoveToken': {
        const move = this.refuseMoves
          ? ({ error: this.refuseMoves, move: null } as unknown as S['MoveResult'])
          : this.backend.moveToken(userId, args[0] as S['MoveTokenRequest'])
        if (move.move) this.broadcast(move.move)
        result = move
        break
      }
      case 'UndoMove': {
        const undo = this.backend.undoMove(userId, String(args[0]))
        if (undo.move) this.broadcast(undo.move)
        result = undo
        break
      }
      // Previews only draw arrows on the other devices' canvas; the mock just accepts them.
      case 'PreviewMove':
        result = { error: null }
        break
      case 'ClearPreview':
      case 'MarkActive':
        break
      default:
        throw new Error(`Unknown hub method ${message.target}`)
    }
    if (message.invocationId === undefined) return
    this.send(
      client,
      result === undefined
        ? { type: 3, invocationId: message.invocationId }
        : { type: 3, invocationId: message.invocationId, result },
    )
  }

  private broadcast(move: S['TokenMovedEvent']) {
    for (const client of this.clients) {
      if (client.encounterId === move.encounterId) {
        this.send(client, { type: 1, target: 'TokenMoved', arguments: [move] })
      }
    }
  }

  private send(client: Client, message: object) {
    client.socket.send(JSON.stringify(message) + RS)
  }
}

interface ImageClient extends Client {
  mapId: string | null
  /** The creature type or character whose icons or portraits it watches. */
  tokenOwnerId: string | null
}

/**
 * A stand-in for the image hub (/hubs/images), with the same SignalR JSON protocol: the
 * editor joins a map's group with WatchMap while one of its background jobs is pending,
 * and the test tells it that a job moved on (backgroundUpdated). Icon and portrait
 * galleries join with WatchTokenImages; the backend's finished jobs reach them by itself.
 */
export class MockImageHub {
  readonly calls: HubCall[] = []
  private readonly clients = new Set<ImageClient>()
  private readonly backend: MockBackend

  constructor(backend: MockBackend) {
    this.backend = backend
    backend.onTokenImageUpdated = (image) => this.tokenImageUpdated(image)
  }

  async attach(context: BrowserContext) {
    await context.route('**/hubs/images/negotiate*', (route) => {
      const id = randomUUID()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          negotiateVersion: 1,
          connectionId: id,
          connectionToken: id,
          availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
        }),
      })
    })
    await context.routeWebSocket(/\/hubs\/images(\?|$)/, (socket) => {
      const client: ImageClient = {
        context,
        socket,
        handshaken: false,
        encounterId: null,
        mapId: null,
        tokenOwnerId: null,
      }
      this.clients.add(client)
      socket.onClose(() => this.clients.delete(client))
      socket.onMessage((data) => {
        const text = typeof data === 'string' ? data : data.toString('utf8')
        for (const record of text.split(RS)) {
          if (record) this.receive(client, JSON.parse(record) as Message)
        }
      })
    })
  }

  /** Editors watching a map right now. */
  watching(mapId?: string): number {
    return [...this.clients].filter((c) => c.mapId && (!mapId || c.mapId === mapId)).length
  }

  /** Galleries watching a creature type's or character's images right now. */
  watchingTokenImages(ownerId?: string): number {
    return [...this.clients].filter(
      (c) => c.tokenOwnerId && (!ownerId || c.tokenOwnerId === ownerId),
    ).length
  }

  /** A version moved on: sent to every gallery watching its owner. */
  tokenImageUpdated(image: S['TokenImage']) {
    for (const client of this.clients) {
      if (client.tokenOwnerId === image.ownerId) {
        this.send(client, { type: 1, target: 'TokenImageUpdated', arguments: [image] })
      }
    }
  }

  /** Open connections, watching or not. */
  get open(): number {
    return this.clients.size
  }

  /** A job moved on: sent to every editor watching its map, as the worker does. */
  backgroundUpdated(background: S['MapBackground']) {
    for (const client of this.clients) {
      if (client.mapId === background.mapId) {
        this.send(client, { type: 1, target: 'BackgroundUpdated', arguments: [background] })
      }
    }
  }

  private receive(client: ImageClient, message: Message) {
    if (!client.handshaken) {
      // {"protocol":"json","version":1}
      client.handshaken = true
      client.socket.send(`{}${RS}`)
      return
    }
    if (message.type === 6) return this.send(client, { type: 6 })
    if (message.type !== 1 || !message.target) return
    const args = message.arguments ?? []
    this.calls.push({ context: client.context, method: message.target, args })
    if (message.target !== 'WatchMap' && message.target !== 'WatchTokenImages') {
      throw new Error(`Unknown hub method ${message.target}`)
    }
    const signedIn = this.backend.userId(client.context) !== null
    if (signedIn && message.target === 'WatchMap') client.mapId = String(args[1])
    if (signedIn && message.target === 'WatchTokenImages') client.tokenOwnerId = String(args[2])
    const result = { error: signedIn ? null : 'notADm' }
    if (message.invocationId !== undefined) {
      this.send(client, { type: 3, invocationId: message.invocationId, result })
    }
  }

  private send(client: Client, message: object) {
    client.socket.send(JSON.stringify(message) + RS)
  }
}
