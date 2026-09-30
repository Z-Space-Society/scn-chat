import { XrpcFetchError, XrpcResponseError } from '@atproto/lex-client'
import { LexError } from '@atproto/lex-data'
import { safeErrorMessage } from './safe-error.ts'

/** The XRPC error name of a failed atproto call, if it was one. */
export const lexErrorCode = (err: unknown) => (err instanceof LexError ? err.error : undefined)

/** PDSs responses when a session was granted fewer permissions than a call needs. */
const SCOPE_ERRORS = new Set(['InsufficientScope', 'ScopeMissingError'])

export type PdsFailure = { status: 403 | 502; error: string; message: string }

/** A response for a failed call to the user's PDS, or undefined for any other error. */
export function pdsFailure(err: unknown): PdsFailure | undefined {
  if (err instanceof XrpcResponseError && SCOPE_ERRORS.has(err.error))
    return {
      status: 403,
      error: 'ScopeMissing',
      message: "Your sign-in doesn't grant this permission. Sign out and back in to grant it.",
    }
  if (err instanceof XrpcResponseError)
    return {
      status: 502,
      error: 'PdsError',
      message: `Your PDS refused the request (${err.error}): ${safeErrorMessage(err)}`,
    }
  if (err instanceof XrpcFetchError)
    return { status: 502, error: 'PdsUnreachable', message: 'Your PDS could not be reached.' }
  return undefined
}
