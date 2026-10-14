import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackgroundWatch, WATCH_RETRY_MS } from './watch'
import { FakeImageHub, version } from './testing'

let online: boolean
let hub: FakeImageHub
let watch: BackgroundWatch
const onUpdate = vi.fn()
const onWatching = vi.fn()

const flush = () => vi.advanceTimersByTimeAsync(0)

function start() {
  watch = new BackgroundWatch({
    campaignId: 'c1',
    mapId: 'map',
    createConnection: hub.factory,
    onUpdate,
    onWatching,
  })
  watch.start()
}

beforeEach(() => {
  vi.useFakeTimers()
  online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  hub = new FakeImageHub()
  onUpdate.mockReset()
  onWatching.mockReset()
})

afterEach(() => {
  watch.stop()
  vi.useRealTimers()
})

describe('BackgroundWatch', () => {
  it('joins the map, then asks for the list, then passes on its updates', async () => {
    start()
    await flush()
    expect(hub.latest.invocations).toEqual([{ method: 'WatchMap', args: ['c1', 'map'] }])
    expect(onWatching).toHaveBeenCalledTimes(1)
    const done = version({ status: 'done' })
    hub.latest.emit('BackgroundUpdated', done)
    // A failed attempt going back into the queue for a retry comes as queued.
    const retry = version({ status: 'queued' })
    hub.latest.emit('BackgroundUpdated', retry)
    expect(onUpdate.mock.calls).toEqual([[done], [retry]])
  })

  it('stops the connection when stopped and ignores it afterwards', async () => {
    start()
    await flush()
    const connection = hub.latest
    watch.stop()
    expect(connection.state).toBe('stopped')
    connection.emit('BackgroundUpdated', version())
    expect(onUpdate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)
  })

  it('reconnects after a loss and asks for the list again, since events were missed', async () => {
    start()
    await flush()
    hub.latest.close(new Error('gone'))
    expect(hub.open).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(WATCH_RETRY_MS[0])
    expect(hub.connections).toHaveLength(2)
    expect(onWatching).toHaveBeenCalledTimes(2)
  })

  it('waits for the connection to come back when offline', async () => {
    start()
    await flush()
    online = false
    hub.latest.close()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)
    online = true
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(hub.connections).toHaveLength(2)
    expect(onWatching).toHaveBeenCalledTimes(2)
  })

  it('retries a failed start with growing waits', async () => {
    hub.startWith = () => Promise.reject(new Error('cold'))
    start()
    await flush()
    expect(hub.connections).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(WATCH_RETRY_MS[0])
    expect(hub.connections).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(WATCH_RETRY_MS[1] - 1)
    expect(hub.connections).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(hub.connections).toHaveLength(3)
  })

  it('gives up when the hub refuses, after one more look at the list', async () => {
    hub.respond = () => ({ error: 'notADm' })
    start()
    await flush()
    expect(hub.open).toHaveLength(0)
    expect(onWatching).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(hub.connections).toHaveLength(1)
  })
})
