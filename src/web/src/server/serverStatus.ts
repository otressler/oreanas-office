// Is the server awake? The production server scales to zero between game
// nights (knowledge/decisions/hosting.md), so the app may open while it sleeps.
//
// startServerGate() probes GET /api/health until it answers "ok":
// - backoff from 1 s growing to a 5 s cap, each attempt aborted after 10 s;
// - no requests while the device is offline (waits for the `online` event);
// - no requests while the page is hidden (waits until it is visible again);
// - stops for good once the server is ready, so nothing keeps it awake.
//
// The status lives in a small store so any later screen can read it.
import { create } from 'zustand'
import { checkHealth } from './health'

export type ServerStatus =
  /** First probe in flight; nothing shown yet so a quick answer doesn't flash a screen. */
  | 'checking'
  /** The server is starting; show the waking screen. */
  | 'waking'
  /** The device has no connection. */
  | 'offline'
  /** The server answered "ok". Final. */
  | 'ready'

interface ServerStatusState {
  status: ServerStatus
}

export const useServerStatus = create<ServerStatusState>(() => ({ status: 'checking' }))

/** How long the first probe may take before the waking screen appears. */
export const GRACE_MS = 800
/** Abort a probe that hangs this long. */
export const ATTEMPT_TIMEOUT_MS = 10_000
const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 5_000
const BACKOFF_FACTOR = 1.5

/** Wait before retry number `failures` (1-based): 1 s, 1.5 s, 2.25 s, 3.4 s, then 5 s. */
export function retryDelay(failures: number): number {
  return Math.min(FIRST_RETRY_MS * BACKOFF_FACTOR ** Math.max(0, failures - 1), MAX_RETRY_MS)
}

let stopCurrent: (() => void) | null = null

/** Starts probing unless a probe loop is already running or the server is ready. */
export function startServerGate(): void {
  if (stopCurrent || useServerStatus.getState().status === 'ready') return
  stopCurrent = runGate()
}

/** Stops probing and forgets the status. For tests. */
export function resetServerGate(): void {
  stopCurrent?.()
  stopCurrent = null
  useServerStatus.setState({ status: 'checking' })
}

function runGate(): () => void {
  const setStatus = (status: ServerStatus) => useServerStatus.setState({ status })
  const getStatus = () => useServerStatus.getState().status

  let stopped = false
  let failures = 0
  let inFlight: AbortController | null = null
  let waitingForVisible = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  setStatus('checking')
  const graceTimer = setTimeout(() => {
    if (getStatus() === 'checking') setStatus('waking')
  }, GRACE_MS)

  function attempt() {
    retryTimer = undefined
    if (stopped || inFlight) return
    if (!navigator.onLine) {
      setStatus('offline')
      return // onOnline() tries again
    }
    if (document.hidden) {
      waitingForVisible = true
      return // onVisibilityChange() tries again
    }

    const controller = new AbortController()
    inFlight = controller
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)

    void checkHealth(controller.signal).then((result) => {
      clearTimeout(timeout)
      inFlight = null
      if (stopped) return
      if (result === 'ok') {
        setStatus('ready')
        stop()
        return
      }
      failures += 1
      if (getStatus() === 'offline' && navigator.onLine) setStatus('waking')
      retryTimer = setTimeout(attempt, retryDelay(failures))
    })
  }

  function onOnline() {
    if (getStatus() === 'offline') setStatus('waking')
    clearTimeout(retryTimer)
    failures = 0
    attempt()
  }

  function onOffline() {
    setStatus('offline')
    clearTimeout(retryTimer)
    retryTimer = undefined
    inFlight?.abort()
  }

  function onVisibilityChange() {
    if (document.hidden || !waitingForVisible) return
    waitingForVisible = false
    attempt()
  }

  function stop() {
    stopped = true
    clearTimeout(graceTimer)
    clearTimeout(retryTimer)
    inFlight?.abort()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (stopCurrent === stop) stopCurrent = null
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibilityChange)
  attempt()
  return stop
}
