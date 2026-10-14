import { describe, expect, it } from 'vitest'
import { de } from '../text/de'
import { ApiRequestError, errorMessage, isApiErrorCode, unwrap } from './errors'
import type { components } from './schema'

// Every value of the generated enum. Listing them here means a new code fails
// type-checking in this test as well as in de.ts.
const ALL_CODES = {
  inviteInvalid: true,
  emailInvalid: true,
  emailTaken: true,
  passwordTooShort: true,
  displayNameInvalid: true,
  invalidCredentials: true,
  lockedOut: true,
  resetLinkInvalid: true,
  googleFailed: true,
  googleNoInvite: true,
  googleEmailTaken: true,
  googleAccountInUse: true,
  googleAlreadyLinked: true,
  nameInvalid: true,
  joinCodeInvalid: true,
  dateInvalid: true,
  notADm: true,
  anotherSessionActive: true,
  sessionEnded: true,
  textTooLong: true,
  mapSizeInvalid: true,
  layoutVersionUnsupported: true,
  cellInvalid: true,
  featureInvalid: true,
  entranceInvalid: true,
  creatureTypeInvalid: true,
  placementInvalid: true,
  characterInvalid: true,
  sessionNotActive: true,
  encounterNotReady: true,
  encounterNotActive: true,
  anotherEncounterActive: true,
  tokenNotFound: true,
  notYourToken: true,
  targetInvalid: true,
  nothingToUndo: true,
} satisfies Record<components['schemas']['ApiErrorCode'], true>

function result(status: number, body?: unknown) {
  const response = new Response(null, { status })
  return Promise.resolve(response.ok ? { data: body, response } : { error: body, response })
}

describe('error texts', () => {
  it('has German text for every API error code', () => {
    for (const code of Object.keys(ALL_CODES)) {
      expect(isApiErrorCode(code)).toBe(true)
      expect(errorMessage(new ApiRequestError(400, code as keyof typeof ALL_CODES))).toMatch(/\S/)
    }
    expect(Object.keys(de.errors).sort()).toEqual(Object.keys(ALL_CODES).sort())
  })

  it('recognises only known codes', () => {
    expect(isApiErrorCode('googleNoInvite')).toBe(true)
    expect(isApiErrorCode('somethingElse')).toBe(false)
    expect(isApiErrorCode('toString')).toBe(false)
    expect(isApiErrorCode(undefined)).toBe(false)
  })

  it('falls back to general messages for failures without a code', () => {
    expect(errorMessage(new ApiRequestError(401))).toBe(de.requestErrors.signedOut)
    expect(errorMessage(new ApiRequestError(403))).toBe(de.requestErrors.forbidden)
    expect(errorMessage(new ApiRequestError(404))).toBe(de.requestErrors.notFound)
    expect(errorMessage(new ApiRequestError(500))).toBe(de.requestErrors.unknown)
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(de.requestErrors.network)
    expect(errorMessage('weird')).toBe(de.requestErrors.unknown)
  })
})

describe('unwrap', () => {
  it('returns the data of a successful response', async () => {
    await expect(unwrap(result(200, { id: 1 }))).resolves.toEqual({ id: 1 })
    await expect(unwrap(result(204))).resolves.toBeUndefined()
  })

  it('throws the code and field of an ApiError', async () => {
    const error = await unwrap(result(400, { code: 'emailTaken', field: 'email' })).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 400, code: 'emailTaken', field: 'email' })
    expect(errorMessage(error)).toBe(de.errors.emailTaken)
  })

  it('throws without a code for unknown or missing bodies', async () => {
    await expect(unwrap(result(409, { code: 'brandNew' }))).rejects.toMatchObject({
      status: 409,
      code: null,
    })
    await expect(unwrap(result(500, 'oops'))).rejects.toMatchObject({ status: 500, code: null })
  })
})
