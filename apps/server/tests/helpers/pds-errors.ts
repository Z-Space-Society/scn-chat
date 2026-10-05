import { XrpcResponseError } from '@atproto/lex-client'

/** An error the way lex-client reports a PDS error response. */
export const pdsError = (status: number, error: string, message: string) =>
  new XrpcResponseError({} as never, new Response(null, { status }), {
    encoding: 'application/json',
    body: { error, message },
  } as never)
