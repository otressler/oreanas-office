// One probe of GET /api/health.
//
// Contract: 200 {status:"ok"} when the server and database are ready; 503
// {status:"waking"} while the database resumes. While the container itself is
// cold-starting the request may fail outright or come back 502/503/504, so
// anything other than a clean "ok" counts as "still waking".
//
// This deliberately uses plain fetch rather than the typed client: it has to
// see raw status codes and network failures, and it runs before anything else.

export type HealthResult = 'ok' | 'waking'

export async function checkHealth(signal: AbortSignal): Promise<HealthResult> {
  try {
    const response = await fetch('/api/health', {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return 'waking'
    const body: unknown = await response.json()
    return isOk(body) ? 'ok' : 'waking'
  } catch {
    // Network error, timeout (abort) or a body that isn't JSON.
    return 'waking'
  }
}

function isOk(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok'
}
