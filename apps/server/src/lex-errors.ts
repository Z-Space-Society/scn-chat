import { LexError } from '@atproto/lex-data'

/** The XRPC error name of a failed atproto call, if it was one. */
export const lexErrorCode = (err: unknown) => (err instanceof LexError ? err.error : undefined)
