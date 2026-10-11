// Turning API responses into data or errors, and errors into German text.
//
// The server answers expected failures with 400/409 and `ApiError { code, field? }`;
// the German text for every code lives in de.ts. Anything else (401, 403, 404,
// 5xx, no connection) gets a general message.
import { de } from '../text/de'
import type { ApiErrorCode } from './types'

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | null
  /** The request field the error belongs to, if the server named one. */
  readonly field: string | null

  constructor(status: number, code: ApiErrorCode | null = null, field: string | null = null) {
    super(code ?? `HTTP ${status}`)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.field = field
  }
}

/** True for the codes the server can send; used for `?fehler=` from redirects too. */
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(de.errors, value)
}

/**
 * The data of an openapi-fetch result, or an ApiRequestError. Network failures
 * propagate as the TypeError fetch throws.
 */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await request
  if (response.ok) return data as T
  const body = error as { code?: unknown; field?: unknown } | undefined
  throw new ApiRequestError(
    response.status,
    isApiErrorCode(body?.code) ? body.code : null,
    typeof body?.field === 'string' ? body.field : null,
  )
}

/** German text for any error a request can end with. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code) return de.errors[error.code]
    if (error.status === 401) return de.requestErrors.signedOut
    if (error.status === 403) return de.requestErrors.forbidden
    if (error.status === 404) return de.requestErrors.notFound
    return de.requestErrors.unknown
  }
  if (error instanceof TypeError) return de.requestErrors.network
  return de.requestErrors.unknown
}
