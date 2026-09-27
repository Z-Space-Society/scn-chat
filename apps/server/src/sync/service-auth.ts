import { AuthRequiredError, verifyJwt } from '@atproto/xrpc-server'

export class ServiceAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServiceAuthError'
  }
}

/** Verify an inbound service auth token and return the issuing DID. */
export async function verifyServiceAuth(
  authorization: string | undefined,
  audience: string,
  lxm: string,
  resolveSigningKey: (did: string, forceRefresh: boolean) => Promise<string>,
): Promise<string> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  if (!token) throw new ServiceAuthError('Missing service auth')
  try {
    const payload = await verifyJwt(token, audience, lxm, (iss, force) =>
      resolveSigningKey(iss.split('#')[0] ?? iss, force),
    )
    return payload.iss.split('#')[0] ?? payload.iss
  } catch (err) {
    if (err instanceof AuthRequiredError) throw new ServiceAuthError(err.message)
    throw err
  }
}
