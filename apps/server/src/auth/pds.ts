import { Client } from '@atproto/lex-client'
import { isExpectedSessionError, type OAuthSession } from '@atproto/oauth-client-node'
import type { OAuthClientLike } from './oauth-client.ts'

export class SessionExpired extends Error {
  readonly did: string

  constructor(did: string, cause?: unknown) {
    super(`The atproto session for ${did} has expired. Sign in again.`, { cause })
    this.name = 'SessionExpired'
    this.did = did
  }
}

export type PdsClientFactory = (did: string) => Promise<Client>

/** Return a function to get the PDS client for a user. */
export function createPdsClientFactory(oauth: OAuthClientLike): PdsClientFactory {
  return async (did) => {
    let session: OAuthSession
    try {
      session = await oauth.restore(did)
    } catch (err) {
      if (isExpectedSessionError(err)) throw new SessionExpired(did, err)
      throw err
    }
    return new Client(session)
  }
}
