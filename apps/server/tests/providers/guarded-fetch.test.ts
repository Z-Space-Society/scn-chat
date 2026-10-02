import { createServer, type Server } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertPublicHost,
  createGuardedFetch,
  guardConnector,
  isPrivateAddress,
  PrivateNetworkError,
} from '../../src/providers/guarded-fetch.ts'

let server: Server
let port: number

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/ok' })
      return res.end()
    }
    if (req.url === '/echo') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => res.end(`${req.method} ${req.headers['x-test']} ${body}`))
      return
    }
    res.end('ok')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const rootCause = (err: unknown): unknown => {
  let current = err
  while (current instanceof Error && current.cause) current = current.cause
  return current
}

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['192.168.1.1', true],
    ['172.16.0.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['fc00::1', true],
    ['fe80::1', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:10.0.0.1', true],
    ['not an address', true],
    ['93.184.216.34', false],
    ['2606:4700:4700::1111', false],
  ])('%s is private: %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected)
  })
})

describe('createGuardedFetch', () => {
  it.each([
    ['an IPv4', '127.0.0.1'],
    ['a bracketed IPv6', '[::1]'],
    ['an IPv4-mapped IPv6', '[::ffff:127.0.0.1]'],
  ])('refuses %s private literal before connecting', async (_kind, host) => {
    await expect(createGuardedFetch()(`http://${host}:${port}/ok`)).rejects.toBeInstanceOf(
      PrivateNetworkError,
    )
  })

  it('refuses a hostname that resolves to a private address', async () => {
    const error = await createGuardedFetch()(`http://localhost:${port}/ok`).catch(
      (err: unknown) => err,
    )
    expect(rootCause(error)).toBeInstanceOf(PrivateNetworkError)
  })

  it('sends a Request made by the built-in fetch, with its method, headers, and body', async () => {
    const guarded = createGuardedFetch(() => false)
    const request = new Request(`http://127.0.0.1:${port}/echo`, {
      method: 'POST',
      headers: { 'x-test': 'yes' },
      body: 'hello',
    })
    expect(await (await guarded(request)).text()).toBe('POST yes hello')
  })

  it('does not follow redirects', async () => {
    const allowAll = createGuardedFetch(() => false)
    expect(await (await allowAll(`http://localhost:${port}/ok`)).text()).toBe('ok')
    await expect(allowAll(`http://localhost:${port}/redirect`)).rejects.toThrow()
  })

  it('returns a redirect unfollowed when the caller asks to follow it by hand', async () => {
    const allowAll = createGuardedFetch(() => false)
    const res = await allowAll(`http://localhost:${port}/redirect`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/ok')
  })
})

describe('guardConnector', () => {
  it('refuses a socket whose real remote address is private, even if the lookup passed', async () => {
    let destroyed = false
    const socket = {
      remoteAddress: '10.0.0.5',
      destroy: () => {
        destroyed = true
      },
    } as unknown as Socket
    const connector = guardConnector(((
      _options: unknown,
      callback: (err: Error | null, socket: Socket) => void,
    ) => callback(null, socket)) as never)
    const result = await new Promise<{ err: Error | null }>((resolve) =>
      connector({} as never, ((err: Error | null) => resolve({ err })) as never),
    )
    expect(result.err).toBeInstanceOf(PrivateNetworkError)
    expect(destroyed).toBe(true)
  })

  it('passes a socket with a public remote address', async () => {
    const socket = { remoteAddress: '93.184.216.34', destroy: () => {} } as unknown as Socket
    const connector = guardConnector(((
      _options: unknown,
      callback: (err: Error | null, socket: Socket) => void,
    ) => callback(null, socket)) as never)
    const result = await new Promise<{ err: Error | null; socket: unknown }>((resolve) =>
      connector(
        {} as never,
        ((err: Error | null, s: unknown) => resolve({ err, socket: s })) as never,
      ),
    )
    expect(result).toEqual({ err: null, socket })
  })
})

describe('assertPublicHost', () => {
  it('refuses a private address and allows a public one', async () => {
    await expect(assertPublicHost('10.0.0.5')).rejects.toBeInstanceOf(PrivateNetworkError)
    await expect(assertPublicHost('[::1]')).rejects.toBeInstanceOf(PrivateNetworkError)
    await expect(assertPublicHost('8.8.8.8')).resolves.toBeUndefined()
  })
})
