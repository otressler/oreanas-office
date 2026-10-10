// One probe of GET /api/health.
//
// Contract: 200 {status:"ok"} when the server and database are ready; 503
// {status:"waking"} while the database resumes; 500 {status:"error"} when the
// server gave up starting (for example it has no database access), which
// waiting won't fix. While the container itself is cold-starting the request
// may fail outright or come back 502/503/504, so anything else counts as
// "still waking".
//
// This deliberately uses plain fetch rather than the typed client: it has to
// see raw status codes and network failures, and it runs before anything else.

export type HealthResult = 'ok' | 'waking' | 'error'

export async function checkHealth(signal: AbortSignal): Promise<HealthResult> {
  try {
    const response = await fetch('/api/health', {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    const body: unknown = await response.json()
    if (response.status === 500 && hasStatus(body, 'error')) return 'error'
    return response.ok && hasStatus(body, 'ok') ? 'ok' : 'waking'
  } catch {
    // Network error, timeout (abort) or a body that isn't JSON.
    return 'waking'
  }
}

function hasStatus(body: unknown, status: string): boolean {
  return (
    typeof body === 'object' && body !== null && (body as { status?: unknown }).status === status
  )
}
