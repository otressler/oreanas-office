// A stand-in for SignalR's HubConnection in unit tests: no server, every call and
// answer under the test's control.
import type { HubConnection } from '@microsoft/signalr'
import type { MoveResult } from '../api/types'
import type { TableClientEvents, TableHubCalls } from './hub'

export type Responder = (method: keyof TableHubCalls, args: unknown[]) => unknown

export interface Invocation {
  method: keyof TableHubCalls
  args: unknown[]
}

/** Answers like a server that accepts everything but moves nothing. */
export const acceptAll: Responder = (method) =>
  method === 'MarkActive' || method === 'ClearPreview'
    ? undefined
    : method === 'JoinEncounter' || method === 'PreviewMove'
      ? { error: null }
      : new Promise(() => {})

export class FakeHubConnection {
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>()
  private readonly closeHandlers: ((error?: Error) => void)[] = []
  readonly invocations: Invocation[] = []
  state: 'new' | 'starting' | 'started' | 'stopped' = 'new'

  private readonly hub: FakeHub
  private readonly startWith: () => Promise<void>

  constructor(hub: FakeHub, startWith: () => Promise<void>) {
    this.hub = hub
    this.startWith = startWith
  }

  async start(): Promise<void> {
    this.state = 'starting'
    await this.startWith()
    if (this.state !== 'starting') throw new Error('stopped while starting')
    this.state = 'started'
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return
    this.close()
  }

  invoke(method: keyof TableHubCalls, ...args: unknown[]): Promise<unknown> {
    if (this.state !== 'started') return Promise.reject(new Error('not connected'))
    const call = { method, args }
    this.invocations.push(call)
    this.hub.invocations.push(call)
    return Promise.resolve(this.hub.respond(method, args))
  }

  on(name: string, handler: (...args: unknown[]) => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set())
    this.handlers.get(name)!.add(handler)
  }

  off(name: string, handler: (...args: unknown[]) => void) {
    this.handlers.get(name)?.delete(handler)
  }

  onclose(handler: (error?: Error) => void) {
    this.closeHandlers.push(handler)
  }

  /** The server sends a message. */
  emit<E extends keyof TableClientEvents>(event: E, ...args: TableClientEvents[E]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }

  /** The connection drops (or is stopped). */
  close(error?: Error) {
    this.state = 'stopped'
    for (const handler of this.closeHandlers) handler(error)
  }
}

/** Makes FakeHubConnections and remembers them; `factory` goes where the real one would. */
export class FakeHub {
  readonly connections: FakeHubConnection[] = []
  readonly invocations: Invocation[] = []
  respond: Responder = acceptAll
  /** How the next connections start: resolve, reject or hang. */
  startWith: () => Promise<void> = () => Promise.resolve()

  factory = (): HubConnection => {
    const connection = new FakeHubConnection(this, () => this.startWith())
    this.connections.push(connection)
    return connection as unknown as HubConnection
  }

  get latest(): FakeHubConnection {
    const connection = this.connections.at(-1)
    if (!connection) throw new Error('no connection yet')
    return connection
  }

  /** The calls of one method, over all connections. */
  calls(method: keyof TableHubCalls): unknown[][] {
    return this.invocations.filter((call) => call.method === method).map((call) => call.args)
  }
}

/**
 * The hub the fight page talks to in page tests, which swap the real connection for it:
 * `vi.mock('../table/createConnection', …)` returning `fakeTable.hub.factory()`.
 */
export const fakeTable = { hub: new FakeHub() }

/** A promise with its resolve on the outside, for answers the test sends later. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

/** A refused move or undo: an error code and no move. */
export function refused(error: NonNullable<MoveResult['error']>): MoveResult {
  return { error, move: null }
}
