import { IdResolver } from '@atproto/identity'
import { assertPublicHost } from '../providers/guarded-fetch.ts'

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

const webHost = (did: string) =>
  did.startsWith('did:web:') ? decodeURIComponent(did.slice(8).split(':')[0] as string) : undefined

export function createIdentityResolver(
  plcUrl?: string,
  options: { allowPrivateNetworks?: boolean } = {},
): IdentityResolver {
  const resolver = new IdResolver({ plcUrl })
  /** Refuse to fetch documents from a host on a private network. */
  const guard = async (host: string | undefined) => {
    if (!host || options.allowPrivateNetworks) return
    try {
      await assertPublicHost(host.split(':')[0] as string)
    } catch (err) {
      // A handle with only a DNS TXT record has no address to fetch from.
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOTFOUND' && code !== 'ENODATA') throw err
    }
  }
  return {
    async resolve(did) {
      await guard(webHost(did))
      const data = await resolver.did.resolveAtprotoData(did)
      if (!data.pds) throw new IdentityResolutionError(did, 'no PDS in DID document')
      await guard(data.handle)
      const handleDid = data.handle ? await resolver.handle.resolve(data.handle) : undefined
      return { did, handle: handleDid === did ? (data.handle ?? null) : null, pdsUrl: data.pds }
    },
    async resolveHandle(handle) {
      await guard(handle)
      return (await resolver.handle.resolve(handle)) ?? null
    },
    async resolveSigningKey(did, forceRefresh = false) {
      await guard(webHost(did))
      return resolver.did.resolveAtprotoKey(did, forceRefresh)
    },
  }
}
