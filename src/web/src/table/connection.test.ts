import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TokenMovedEvent } from '../api/types'
import {
  MARK_ACTIVE_EVERY_MS,
  NotConnectedError,
  TableConnection,
  reconnectDelay,
  type TableStatus,
} from './connection'
import { FakeHub } from './testing'

let online: boolean
let hidden: boolean
let hub: FakeHub
let table: TableConnection | undefined
let statuses: TableStatus[]
const onJoined = vi.fn()
const onMoved = vi.fn()
const onEnded = vi.fn()
const onRejected = vi.fn()
const recheckServer = vi.fn()

function setOnline(value: boolean) {
  online = value
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

function setHidden(value: boolean) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

const flush = () => vi.advanceTimersByTimeAsync(0)

function startTable() {
  table = new TableConnection({
    encounterId: 'e1',
    createConnection: hub.factory,
    recheckServer,
    onStatus: (status) => statuses.push(status),
    onJoined,
    onMoved,
    onEnded,
    onRejected,
  })
  table.start()
  return table
}

beforeEach(() => {
  vi.useFakeTimers()
  online = true
  hidden = false
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  hub = new FakeHub()
  statuses = []
  for (const fn of [onJoined, onMoved, onEnded, onRejected, recheckServer]) fn.mockReset()
})

afterEach(() => {
  table?.dispose()
  table = undefined
  vi.useRealTimers()
  delete (document as { hidden?: boolean }).hidden
})

describe('reconnectDelay', () => {
  it('waits 0 s, 1 s, 2 s, 5 s, then every 10 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(reconnectDelay)).toEqual([0, 1000, 2000, 5000, 10000, 10000])
  })
})

describe('TableConnection', () => {
  it('joins the encounter, then asks for the board', async () => {
    const table = startTable()
    expect(table.status).toBe('connecting')
    await flush()

    expect(table.status).toBe('connected')
    expect(hub.calls('JoinEncounter')).toEqual([['e1']])
    expect(onJoined).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(['connected'])
  })

  it('passes on moves and the end of the fight', async () => {
    startTable()
    await flush()
    const move = { tokenId: 't1', version: 2 } as TokenMovedEvent
    hub.latest.emit('TokenMoved', move)
    hub.latest.emit('EncounterEnded', 'e1')
    expect(onMoved).toHaveBeenCalledWith(move)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('reconnects at once after a drop, joins again and reloads the board', async () => {
    const table = startTable()
    await flush()
    hub.latest.close(new Error('gone'))
    expect(table.status).toBe('reconnecting')

    await flush()
    expect(table.status).toBe('connected')
    expect(hub.connections).toHaveLength(2)
    expect(hub.calls('JoinEncounter')).toHaveLength(2)
    expect(onJoined).toHaveBeenCalledTimes(2)
    // A drop isn't a failed attempt; the server answered a moment ago.
    expect(recheckServer).not.toHaveBeenCalled()
  })

  it('backs off between failed attempts and asks the server gate to check the server', async () => {
    const table = startTable()
    await flush()
    hub.startWith = () => Promise.reject(new Error('502'))
    hub.latest.close()
    await flush() // attempt 1 at 0 s fails
    expect(hub.connections).toHaveLength(2)
    expect(recheckServer).toHaveBeenCalledTimes(1)

    for (const [i, delay] of [1000, 2000, 5000, 10000, 10000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(hub.connections).toHaveLength(2 + i)
      await vi.advanceTimersByTimeAsync(1)
      expect(hub.connections).toHaveLength(3 + i)
    }
    expect(table.status).toBe('reconnecting')
    expect(recheckServer).toHaveBeenCalledTimes(6)

    hub.startWith = () => Promise.resolve()
    await vi.advanceTimersByTimeAsync(10000)
    expect(table.status).toBe('connected')
  })

  it('waits for the network instead of trying while offline', async () => {
    const table = startTable()
    await flush()
    setOnline(false)
    expect(table.status).toBe('offline')
    expect(hub.latest.state).toBe('stopped')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)

    setOnline(true)
    await flush()
    expect(table.status).toBe('connected')
    expect(onJoined).toHaveBeenCalledTimes(2)
  })

  it('doesn’t retry while the device is offline after a drop', async () => {
    const table = startTable()
    await flush()
    online = false
    hub.latest.close()
    expect(table.status).toBe('offline')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)
  })

  it('closes the connection in the background and reconnects when visible', async () => {
    const table = startTable()
    await flush()
    setHidden(true)
    expect(table.status).toBe('paused')
    expect(hub.latest.state).toBe('stopped')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)

    setHidden(false)
    await flush()
    expect(table.status).toBe('connected')
    expect(onJoined).toHaveBeenCalledTimes(2)
  })

  it('doesn’t connect while opened in the background', async () => {
    hidden = true
    const table = startTable()
    await flush()
    expect(table.status).toBe('paused')
    expect(hub.connections).toHaveLength(0)
  })

  it('stays idle after the server’s idle timeout until the person is back', async () => {
    const table = startTable()
    await flush()
    hub.latest.emit('IdleTimeout')
    expect(table.status).toBe('idle')
    expect(hub.latest.state).toBe('stopped')
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(hub.connections).toHaveLength(1)

    window.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(table.status).toBe('connected')
    expect(onJoined).toHaveBeenCalledTimes(2)
  })

  it('also wakes from idle on a key press', async () => {
    const table = startTable()
    await flush()
    hub.latest.emit('IdleTimeout')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await flush()
    expect(table.status).toBe('connected')
  })

  it('tells the server the person is there at most once a minute', async () => {
    startTable()
    await flush()
    window.dispatchEvent(new Event('pointerdown'))
    expect(hub.calls('MarkActive')).toHaveLength(0) // joining just counted

    await vi.advanceTimersByTimeAsync(MARK_ACTIVE_EVERY_MS)
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('pointerdown'))
    expect(hub.calls('MarkActive')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(MARK_ACTIVE_EVERY_MS)
    setHidden(true)
    window.dispatchEvent(new Event('pointerdown'))
    expect(hub.calls('MarkActive')).toHaveLength(1)
  })

  it('sends moves and undos only while connected', async () => {
    hub.respond = (method, args) =>
      method === 'JoinEncounter' ? { error: null } : { error: null, move: { args } }
    const table = startTable()
    await expect(table.move({ tokenId: 't1', x: 1, y: 2 })).rejects.toBeInstanceOf(
      NotConnectedError,
    )
    await flush()
    await expect(table.move({ tokenId: 't1', x: 1, y: 2 })).resolves.toEqual({
      error: null,
      move: { args: [{ tokenId: 't1', x: 1, y: 2 }] },
    })
    await expect(table.undo()).resolves.toMatchObject({ move: { args: ['e1'] } })

    setOnline(false)
    await expect(table.undo()).rejects.toBeInstanceOf(NotConnectedError)
  })

  it('reloads the board and waits for the person when the fight isn’t running', async () => {
    hub.respond = () => ({ error: 'encounterNotActive' })
    const table = startTable()
    await flush()
    expect(table.status).toBe('idle')
    expect(onRejected).toHaveBeenCalledWith('encounterNotActive')
    expect(onJoined).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)
  })

  it('stops everything when disposed', async () => {
    const table = startTable()
    await flush()
    const connection = hub.latest
    table.dispose()
    expect(connection.state).toBe('stopped')
    setHidden(true)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)
  })
})
