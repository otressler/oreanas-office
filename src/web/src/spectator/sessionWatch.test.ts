import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WatchResult, WatchedSession } from '../api/types'
import { FakeHub } from '../table/testing'
import { SessionWatch, type WatchStatus } from './sessionWatch'

const watched: WatchedSession = {
  sessionId: 's1',
  campaignId: 'c1',
  title: 'Die Seilbrücke',
  date: '2026-10-17',
  status: 'active',
  playMode: 'byod',
  activeEncounterId: null,
  characters: [],
}

const result = (fields: Partial<WatchResult> = {}): WatchResult => ({
  error: null,
  mode: 'spectator',
  session: watched,
  ...fields,
})

let hub: FakeHub
let statuses: WatchStatus[]
let watch: SessionWatch | undefined
const events = {
  onWatched: vi.fn(),
  onDenied: vi.fn(),
  onEncounterStarted: vi.fn(),
  onEncounterEnded: vi.fn(),
  onSessionEnded: vi.fn(),
  onPlayModeChanged: vi.fn(),
}

function start(sharedScreen = false) {
  watch = new SessionWatch({
    sessionId: 's1',
    sharedScreen,
    createConnection: hub.factory,
    recheckServer: vi.fn(),
    onStatus: (status) => statuses.push(status),
    ...events,
  })
  watch.start()
  return watch
}

const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  hub = new FakeHub()
  hub.respond = (method) => (method === 'WatchSession' ? result() : undefined)
  statuses = []
  for (const fn of Object.values(events)) fn.mockReset()
})

afterEach(() => {
  watch?.dispose()
  watch = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SessionWatch', () => {
  it('watches the session and reports its state', async () => {
    start()
    await flush()

    expect(hub.calls('WatchSession')).toEqual([[{ sessionId: 's1', sharedScreen: false }]])
    expect(statuses).toEqual(['connected'])
    expect(events.onWatched).toHaveBeenCalledWith(watched)
  })

  it('passes on what the session group hears', async () => {
    start()
    await flush()

    hub.latest.emit('EncounterStarted', { sessionId: 's1', encounterId: 'e1' })
    hub.latest.emit('EncounterEnded', 'e1')
    hub.latest.emit('PlayModeChanged', { sessionId: 's1', playMode: 'local' })

    expect(events.onEncounterStarted).toHaveBeenCalledWith({ sessionId: 's1', encounterId: 'e1' })
    expect(events.onEncounterEnded).toHaveBeenCalledWith('e1')
    expect(events.onPlayModeChanged).toHaveBeenCalledWith({ sessionId: 's1', playMode: 'local' })
  })

  it('disconnects when the session ends, and connects again on the next touch', async () => {
    start()
    await flush()

    hub.latest.emit('SessionEnded', 's1')
    await flush()
    expect(events.onSessionEnded).toHaveBeenCalledWith('s1')
    expect(watch!.status).toBe('closed')
    expect(hub.latest.state).toBe('stopped')

    // Nobody touches it: no retry.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(hub.connections).toHaveLength(1)

    // A touch: the session was continued meanwhile.
    window.dispatchEvent(new Event('pointerdown'))
    await flush()
    expect(hub.connections).toHaveLength(2)
    expect(watch!.status).toBe('connected')
  })

  it('closes again when a touch finds the session still ended', async () => {
    hub.respond = () => result({ session: { ...watched, status: 'ended' } })
    start()
    await flush()

    expect(watch!.status).toBe('closed')
    expect(events.onWatched).toHaveBeenCalledOnce()
  })

  it('watches again after a drop, so the state is never stale', async () => {
    start()
    await flush()

    hub.latest.close(new Error('lost'))
    expect(watch!.status).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(0)
    await flush()

    expect(hub.calls('WatchSession')).toHaveLength(2)
    expect(watch!.status).toBe('connected')
    expect(events.onWatched).toHaveBeenCalledTimes(2)
  })

  it('does not retry an access error', async () => {
    hub.respond = () => result({ error: 'tokenNotFound', session: null })
    start()
    await flush()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(watch!.status).toBe('denied')
    expect(events.onDenied).toHaveBeenCalledWith('tokenNotFound')
    expect(hub.connections).toHaveLength(1)
  })

  it('falls back to a spectator screen when the session is not in local mode', async () => {
    hub.respond = (method, args) =>
      method === 'WatchSession'
        ? (args[0] as { sharedScreen: boolean }).sharedScreen
          ? result({ error: 'notLocalMode', mode: 'sharedScreen', session: null })
          : result()
        : undefined
    start(true)
    await flush()

    expect(hub.calls('WatchSession')).toEqual([
      [{ sessionId: 's1', sharedScreen: true }],
      [{ sessionId: 's1', sharedScreen: false }],
    ])
    expect(watch!.sharedScreen).toBe(false)
    expect(watch!.status).toBe('connected')
  })

  it('pauses in the background and watches again when visible', async () => {
    let hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    start()
    await flush()

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(watch!.status).toBe('paused')
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(watch!.status).toBe('connected')
    expect(hub.calls('WatchSession')).toHaveLength(2)
  })

  it('goes idle after the server’s timeout and resumes on a touch', async () => {
    start()
    await flush()

    hub.latest.emit('IdleTimeout')
    expect(watch!.status).toBe('idle')
    window.dispatchEvent(new Event('pointerdown'))
    await flush()

    expect(watch!.status).toBe('connected')
  })
})
