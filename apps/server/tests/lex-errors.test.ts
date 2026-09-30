import { XrpcFetchError } from '@atproto/lex-client'
import { describe, expect, it } from 'vitest'
import { pdsFailure } from '../src/lex-errors.ts'
import { pdsError } from './helpers/pds-errors.ts'

describe('pdsFailure', () => {
  it.each(['InsufficientScope', 'ScopeMissingError'])(
    'asks the user to sign in again for %s',
    (code) => {
      expect(
        pdsFailure(pdsError(403, code, 'Missing required scope "blob:application/pdf"')),
      ).toEqual({
        status: 403,
        error: 'ScopeMissing',
        message: "Your sign-in doesn't grant this permission. Sign out and back in to grant it.",
      })
    },
  )

  it("passes on another PDS error's code and message as a 502", () => {
    expect(pdsFailure(pdsError(400, 'InvalidRecord', 'Record is too large'))).toEqual({
      status: 502,
      error: 'PdsError',
      message: 'Your PDS refused the request (InvalidRecord): Record is too large',
    })
  })

  it('redacts anything that looks like a secret in the message', () => {
    const failure = pdsFailure(pdsError(400, 'InvalidRequest', 'bad header Bearer abc.def.ghi'))
    expect(failure?.message).not.toContain('abc.def.ghi')
  })

  it('says the PDS could not be reached when the request never got an answer', () => {
    expect(
      pdsFailure(new XrpcFetchError({} as never, new TypeError('fetch failed'))),
    ).toMatchObject({
      status: 502,
      error: 'PdsUnreachable',
    })
  })

  it('returns undefined for errors that did not come from a PDS', () => {
    expect(pdsFailure(new Error('boom'))).toBeUndefined()
  })
})
