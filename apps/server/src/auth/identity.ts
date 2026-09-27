import { IdResolver } from '@atproto/identity'

export type ResolvedIdentity = { did: string; handle: string | null; pdsUrl: string }

export interface IdentityResolver {
  resolve(did: string): Promise<ResolvedIdentity>
  resolveHandle(handle: string): Promise<string | null>
  /** The DID's atproto signing key. */
  resolveSigningKey(did: string, forceRefresh?: boolean): Promise<string>
}

export class IdentityResolutionError extends Error {
  constructor(did: string, reason: string) {
    super(`Cannot resolve ${did}: ${reason}`)
    this.name = 'IdentityResolutionError'
  }
}

export function createIdentityResolver(plcUrl?: string): IdentityResolver {
  const resolver = new IdResolver({ plcUrl })
  return {
    async resolve(did) {
      const data = await resolver.did.resolveAtprotoData(did)
      if (!data.pds) throw new IdentityResolutionError(did, 'no PDS in DID document')
      const handleDid = data.handle ? await resolver.handle.resolve(data.handle) : undefined
      return { did, handle: handleDid === did ? (data.handle ?? null) : null, pdsUrl: data.pds }
    },
    async resolveHandle(handle) {
      return (await resolver.handle.resolve(handle)) ?? null
    },
    async resolveSigningKey(did, forceRefresh = false) {
      return resolver.did.resolveAtprotoKey(did, forceRefresh)
    },
  }
}
