import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { de } from '../text/de'
import { ServerGate } from './ServerGate'
import { ATTEMPT_TIMEOUT_MS, GRACE_MS, resetServerGate, retryDelay } from './serverStatus'

const CHILD = 'Der Spieltisch'

function ok() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function waking(status = 503) {
  return new Response(JSON.stringify({ status: 'waking' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: Mock<typeof fetch>
let online: boolean
let hidden: boolean

function setOnline(value: boolean) {
  online = value
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

function setHidden(value: boolean) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Lets timers and pending promises run, inside act() so React re-renders. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function renderGate() {
  return render(
    <ServerGate>
      <p>{CHILD}</p>
    </ServerGate>,
  )
}

const wakingScreen = () => screen.queryByText(de.serverGate.wakingTitle)
const offlineScreen = () => screen.queryByText(de.serverGate.offlineTitle)
const child = () => screen.queryByText(CHILD)

beforeEach(() => {
  vi.useFakeTimers()
  online = true
  hidden = false
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  resetServerGate()
  vi.useRealTimers()
  delete (document as { hidden?: boolean }).hidden
})

describe('ServerGate', () => {
  it('renders the children at once when the server is ready, without a waking screen', async () => {
    fetchMock.mockResolvedValue(ok())
    renderGate()

    await advance(0)
    expect(child()).toBeInTheDocument()
    expect(wakingScreen()).not.toBeInTheDocument()

    // Ready is final: no further polling that would keep the server awake.
    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/health')
  })

  it('stays blank during the grace period instead of flashing the waking screen', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    renderGate()

    await advance(GRACE_MS - 1)
    expect(wakingScreen()).not.toBeInTheDocument()
    expect(child()).not.toBeInTheDocument()

    await advance(1)
    expect(wakingScreen()).toBeInTheDocument()
  })

  it('shows the waking screen on 503 and the children once the server is ok', async () => {
    fetchMock.mockResolvedValueOnce(waking(503)).mockResolvedValueOnce(ok())
    renderGate()

    await advance(GRACE_MS)
    expect(wakingScreen()).toBeInTheDocument()
    expect(screen.getByText(de.serverGate.wakingBody)).toBeInTheDocument()
    expect(child()).not.toBeInTheDocument()

    await advance(retryDelay(1))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(child()).toBeInTheDocument()
    expect(wakingScreen()).not.toBeInTheDocument()
  })

  it('treats network errors and 502/504 as waking and backs off up to 5 s', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(waking(502))
      .mockResolvedValueOnce(waking(504))
      .mockResolvedValueOnce(new Response('<html>', { status: 200 }))
      .mockResolvedValue(waking(503))
    renderGate()

    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const delays = [1_000, 1_500, 2_250, 3_375, 5_000, 5_000]
    for (const [i, delay] of delays.entries()) {
      await advance(delay - 1)
      expect(fetchMock).toHaveBeenCalledTimes(i + 1)
      await advance(1)
      expect(fetchMock).toHaveBeenCalledTimes(i + 2)
    }
    expect(wakingScreen()).toBeInTheDocument()
    expect(child()).not.toBeInTheDocument()
  })

  it('aborts an attempt that hangs and tries again', async () => {
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
        }),
    )
    fetchMock.mockResolvedValue(ok())
    renderGate()

    await advance(ATTEMPT_TIMEOUT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wakingScreen()).toBeInTheDocument()

    await advance(retryDelay(1))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(child()).toBeInTheDocument()
  })

  it('shows the offline state without calling the server, and resumes when back online', async () => {
    online = false
    fetchMock.mockResolvedValue(ok())
    renderGate()

    await advance(0)
    expect(offlineScreen()).toBeInTheDocument()
    expect(screen.getByText(de.serverGate.offlineBody)).toBeInTheDocument()

    await advance(30_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(offlineScreen()).toBeInTheDocument()

    act(() => setOnline(true))
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(child()).toBeInTheDocument()
  })

  it('switches to the offline state when the connection drops while waking', async () => {
    fetchMock.mockResolvedValue(waking(503))
    renderGate()
    await advance(GRACE_MS)
    expect(wakingScreen()).toBeInTheDocument()

    act(() => setOnline(false))
    await advance(0)
    expect(offlineScreen()).toBeInTheDocument()
    const calls = fetchMock.mock.calls.length

    await advance(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('makes no requests while the page is hidden and resumes when visible', async () => {
    fetchMock.mockResolvedValueOnce(waking(503)).mockResolvedValue(ok())
    renderGate()
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    act(() => setHidden(true))
    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(child()).not.toBeInTheDocument()

    act(() => setHidden(false))
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(child()).toBeInTheDocument()
  })

  it('does not start probing while the page is opened in the background', async () => {
    hidden = true
    fetchMock.mockResolvedValue(ok())
    renderGate()

    await advance(10_000)
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => setHidden(false))
    await advance(0)
    expect(child()).toBeInTheDocument()
  })
})
