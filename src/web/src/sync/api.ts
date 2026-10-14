// The sync's requests. Every /api/sync call carries the sync version
// (knowledge/decisions/offline-prep-pwa.md, "Special cases", outdated app); the failures
// that stop a whole sync become a SyncFailure, the rest stay ApiRequestErrors.
import { api } from '../api/client'
import { ApiRequestError, unwrap } from '../api/errors'
import type {
  CampaignSummary,
  SyncPushRequest,
  SyncPushResponse,
  SyncServerItem,
  SyncVersionList,
} from '../api/types'

/** Matches SyncProtocol.CurrentVersion on the server. */
export const SYNC_VERSION = 1
export const SYNC_VERSION_HEADER = 'X-Sync-Version'

const headers = { [SYNC_VERSION_HEADER]: String(SYNC_VERSION) }

/** Why a sync could not go on. */
export type SyncFailureKind =
  /** No connection (fetch threw). */
  | 'offline'
  /** 426: this app is too old to sync. */
  | 'outdated'
  /** 401: the sign-in ended. */
  | 'signedOut'
  /** Anything else (5xx, an answer the app doesn't understand). */
  | 'failed'

export class SyncFailure extends Error {
  readonly kind: SyncFailureKind
  readonly cause: unknown
  constructor(kind: SyncFailureKind, cause?: unknown) {
    super(kind)
    this.name = 'SyncFailure'
    this.kind = kind
    this.cause = cause
  }
}

/** Runs a request and turns the failures that end a sync into a SyncFailure. */
async function guard<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  try {
    return await unwrap(request)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 426 || error.code === 'syncOutdated') {
        throw new SyncFailure('outdated', error)
      }
      if (error.status === 401) throw new SyncFailure('signedOut', error)
      // 403 and 404 are the caller's to read (e.g. lost `dm` rights).
      if (error.status === 403 || error.status === 404) throw error
      throw new SyncFailure('failed', error)
    }
    if (error instanceof TypeError) throw new SyncFailure('offline', error)
    throw new SyncFailure('failed', error)
  }
}

export function fetchCampaigns(): Promise<CampaignSummary[]> {
  return guard(api.GET('/api/campaigns'))
}

export function pushItems(body: SyncPushRequest): Promise<SyncPushResponse> {
  return guard(api.POST('/api/sync/push', { body, headers }))
}

export function fetchVersions(campaignId: string): Promise<SyncVersionList> {
  return guard(
    api.GET('/api/sync/campaigns/{campaignId}/versions', {
      params: { path: { campaignId } },
      headers,
    }),
  )
}

export function fetchItems(campaignId: string, ids: string[]): Promise<SyncServerItem[]> {
  return guard(
    api.POST('/api/sync/campaigns/{campaignId}/items', {
      params: { path: { campaignId } },
      body: { ids },
      headers,
    }),
  )
}
