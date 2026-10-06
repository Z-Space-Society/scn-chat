import { setupForTest } from '@scn-chat/plugin-api/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import scnMemberRegistry from '../src/index.ts'

const TOKEN = 't'.repeat(48)
const ALICE = 'did:plc:alice'
const BOB = 'did:plc:bob'
const CRON = { startedAt: '2026-10-05T00:00:00Z' }
const signIn = (did: string) => ({ did, handle: null, pdsUrl: 'https://pds.example' })

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
  const test = await setupForTest(scnMemberRegistry({ token: TOKEN }), { accounts: [ALICE] })
  const warn = vi.fn()
  const error = vi.fn()
  Object.assign(test.ctx.logger, { warn, error })
  const members = () => test.roleMembers.get('scn-member')
  return { ...test, fetch, warn, error, members }
}

afterEach(() => vi.unstubAllGlobals())

describe('scn-member-registry', () => {
  it('adds members with an account at cron, asking for active members with the token', async () => {
    const { fire, fetch, members } = await setup(list(ALICE, BOB))
    await fire('cron', CRON)
    expect(members()).toEqual([ALICE])
    const url = new URL(String(fetch.mock.calls[0]?.[0 as never]))
    expect(url.pathname).toBe('/xrpc/network.sharedcomputer.membership.listMembers')
    expect(url.searchParams.get('activeOnly')).toBe('true')
    expect(url.searchParams.get('token')).toBe(TOKEN)
  })

  it('adds a member signing in for the first time, and not someone the registry lacks', async () => {
    const { fire, members } = await setup(list(BOB))
    await fire('signIn:before', signIn('did:plc:carol'))
    expect(members()).toEqual([])
    await fire('signIn:before', signIn(BOB))
    expect(members()).toEqual([BOB])
  })

  it('removes revoked members at cron', async () => {
    const { fire, members } = await setup(list(BOB), list(ALICE))
    await fire('signIn:before', signIn(BOB))
    await fire('cron', CRON)
    expect(members()).toEqual([ALICE])
  })

  it.each([
    ['a network error', new TypeError('fetch failed')],
    [
      'an error answer',
      Response.json(
        { error: 'script_error', message: 'forbidden: invalid service token' },
        { status: 500 },
      ),
    ],
    ['a malformed list', Response.json({ members: [{ id: BOB }] })],
  ])('keeps the stored members after %s, and never logs the token', async (_, failure) => {
    const { fire, warn, members } = await setup(list(ALICE), failure)
    await fire('cron', CRON)
    await fire('cron', CRON)
    expect(members()).toEqual([ALICE])
    expect(warn).toHaveBeenCalled()
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN)
  })

  it('applies an empty list that replaces members, and logs it as an error', async () => {
    const { fire, error, members } = await setup(list(ALICE), list())
    await fire('cron', CRON)
    await fire('cron', CRON)
    expect(members()).toEqual([])
    expect(error).toHaveBeenCalledOnce()
  })

  it('shares one fetch between syncs that arrive together', async () => {
    const { fire, fetch } = await setup(list(ALICE))
    await Promise.all([fire('signIn:before', signIn(BOB)), fire('cron', CRON)])
    expect(fetch).toHaveBeenCalledOnce()
  })
})
