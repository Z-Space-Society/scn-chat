import type { RoleSource } from '@scn-chat/plugin-api'
import { setupForTest } from '@scn-chat/plugin-api/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import scnMemberRegistry from '../src/index.ts'

const TOKEN = 't'.repeat(48)
const ALICE = { did: 'did:plc:alice', pdsUrl: 'https://pds.example' }
const BOB = { did: 'did:plc:bob', pdsUrl: 'https://pds.example' }
const REQUEST = { signIn: false }
const SIGN_IN = { signIn: true }

const list = (...dids: string[]) =>
  Response.json({ members: dids.map((did) => ({ did, active: true, grantedAt: 'x' })) })

/** Set up the plugin against a fetch that answers with each response in turn, repeating the last. */
async function setup(...responses: (Response | Error | Promise<Response>)[]) {
  const fetch = vi.fn(async () => {
    const next = responses.length > 1 ? responses.shift() : responses[0]
    if (next instanceof Error) throw next
    return ((await next) as Response).clone()
  })
  vi.stubGlobal('fetch', fetch)
  const test = await setupForTest(scnMemberRegistry({ token: TOKEN, pollMinutes: 5 }))
  const warn = vi.fn()
  const error = vi.fn()
  Object.assign(test.ctx.logger, { warn, error })
  const source = test.roleSources[0] as RoleSource
  return { ...test, fetch, warn, error, source }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('scn-member-registry', () => {
  it('gives the role to listed members only, asking for active members with the token', async () => {
    const { source, fetch, close } = await setup(list(ALICE.did))
    expect(await source.rolesFor(ALICE, REQUEST)).toEqual(['scn-member'])
    expect(await source.rolesFor(BOB, REQUEST)).toEqual([])
    const url = new URL(String(fetch.mock.calls[0]?.[0 as never]))
    expect(url.pathname).toBe('/xrpc/network.sharedcomputer.membership.listMembers')
    expect(url.searchParams.get('activeOnly')).toBe('true')
    expect(url.searchParams.get('token')).toBe(TOKEN)
    await close()
  })

  it('fetches again at sign-in, so someone approved since the last fetch gets the role', async () => {
    const { source, fetch, close } = await setup(list(ALICE.did), list(ALICE.did, BOB.did))
    expect(await source.rolesFor(BOB, REQUEST)).toEqual([])
    expect(await source.rolesFor(BOB, SIGN_IN)).toEqual(['scn-member'])
    expect(fetch).toHaveBeenCalledTimes(2)
    await close()
  })

  it('waits for the first fetch rather than answering with no roles', async () => {
    let answer!: (res: Response) => void
    const { source, close } = await setup(new Promise<Response>((resolve) => (answer = resolve)))
    const roles = source.rolesFor(ALICE, REQUEST)
    answer(list(ALICE.did))
    expect(await roles).toEqual(['scn-member'])
    await close()
  })

  it.each([
    ['a network error', new TypeError('fetch failed')],
    [
      'an error answer',
      Response.json(
        { error: 'script_error', message: 'forbidden: invalid service token' },
        {
          status: 500,
        },
      ),
    ],
    ['a malformed list', Response.json({ members: [{ id: 'did:plc:bob' }] })],
  ])('keeps the previous list after %s, and never logs the token', async (_, failure) => {
    const { source, warn, close } = await setup(list(ALICE.did), failure)
    expect(await source.rolesFor(ALICE, SIGN_IN)).toEqual(['scn-member'])
    expect(await source.rolesFor(ALICE, SIGN_IN)).toEqual(['scn-member'])
    expect(warn).toHaveBeenCalled()
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN)
    await close()
  })

  it('applies an empty list that replaces members, and logs it as an error', async () => {
    const { source, error, close } = await setup(list(ALICE.did), list())
    await source.rolesFor(ALICE, REQUEST)
    expect(await source.rolesFor(ALICE, SIGN_IN)).toEqual([])
    expect(error).toHaveBeenCalledOnce()
    await close()
  })

  it('shares one fetch between sign-ins that arrive together', async () => {
    const { source, fetch, close } = await setup(list(ALICE.did))
    await source.rolesFor(ALICE, REQUEST)
    await Promise.all([source.rolesFor(ALICE, SIGN_IN), source.rolesFor(BOB, SIGN_IN)])
    expect(fetch).toHaveBeenCalledTimes(2)
    await close()
  })

  it('polls every pollMinutes, and stops once closed', async () => {
    vi.useFakeTimers()
    const { source, fetch, close } = await setup(list(ALICE.did))
    await source.rolesFor(ALICE, REQUEST)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    await close()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
