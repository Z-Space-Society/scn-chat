import { type LookupAddress, lookup } from 'node:dns'
import { lookup as lookupAll } from 'node:dns/promises'
import { isIP, type Socket } from 'node:net'
import ipaddr from 'ipaddr.js'
import { Agent, buildConnector, fetch as undiciFetch } from 'undici'

const BLOCKED_RANGES = new Set([
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'carrierGradeNat',
  'private',
  'reserved',
  'uniqueLocal',
  'ipv4Mapped',
  'rfc6145',
  'rfc6052',
  '6to4',
  'teredo',
])

export class PrivateNetworkError extends Error {
  constructor(address: string) {
    super(`Refusing to connect to private network address ${address}`)
    this.name = 'PrivateNetworkError'
  }
}

/** Is this an address a user endpoint must not reach? Unparseable addresses count as private. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '')
  if (!ipaddr.isValid(bare)) return true
  return BLOCKED_RANGES.has(ipaddr.process(bare).range())
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

type IsBlocked = (address: string) => boolean

/** DNS lookup that fails when any resolved address is private. */
export const guardedLookup =
  (isBlocked: IsBlocked = isPrivateAddress) =>
  (hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) => {
    lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, [])
      const blocked = addresses.find((entry) => isBlocked(entry.address))
      if (blocked)
        return callback(new PrivateNetworkError(blocked.address) as NodeJS.ErrnoException, [])
      const first = addresses[0]
      if (!first)
        return callback(new Error(`No addresses for ${hostname}`) as NodeJS.ErrnoException, [])
      if (options.all) return callback(null, addresses)
      callback(null, first.address, first.family)
    })
  }

type Connector = buildConnector.connector

/** Wrap a connector so the socket's real remote address is checked before anything is sent. */
export function guardConnector(
  connector: Connector,
  isBlocked: IsBlocked = isPrivateAddress,
): Connector {
  return (options, callback) =>
    connector(options, (err, socket) => {
      if (err || !socket) return callback(err ?? new Error('connection failed'), null)
      const address = (socket as Socket).remoteAddress
      if (!address || isBlocked(address)) {
        socket.destroy()
        return callback(new PrivateNetworkError(address ?? 'unknown'), null)
      }
      callback(null, socket)
    })
}

/** Fail unless every address a host resolves to is public. */
export async function assertPublicHost(
  hostname: string,
  isBlocked: IsBlocked = isPrivateAddress,
): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host)
    ? [host]
    : (await lookupAll(host, { all: true })).map((a) => a.address)
  const blocked = addresses.find(isBlocked)
  if (blocked) throw new PrivateNetworkError(blocked)
}

/**
 * A fetch for user-supplied endpoints that cannot reach private networks or follow redirects.
 * With `redirect: 'manual'` it returns redirects for the caller to follow, each hop guarded again.
 */
export function createGuardedFetch(isBlocked: IsBlocked = isPrivateAddress): typeof fetch {
  const agent = new Agent({
    connect: guardConnector(
      buildConnector({ lookup: guardedLookup(isBlocked) as never }),
      isBlocked,
    ),
  })
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(host) && isBlocked(host)) throw new PrivateNetworkError(host)
    // undici's own fetch can't read a Request made by Node's built-in fetch, so unpack it.
    const fromRequest =
      input instanceof Request
        ? {
            method: input.method,
            headers: [...input.headers],
            body: input.body,
            duplex: 'half' as const,
          }
        : {}
    return undiciFetch(url, {
      ...fromRequest,
      ...(init as object),
      redirect: init?.redirect === 'manual' ? 'manual' : 'error',
      dispatcher: agent,
    })
  }) as unknown as typeof fetch
}
