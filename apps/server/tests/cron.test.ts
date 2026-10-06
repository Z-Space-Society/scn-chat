import { type ActionHooks, definePlugin, type PluginContext } from '@scn-chat/plugin-api'
import { describe, expect, it, vi } from 'vitest'
import { adminHarness } from './helpers/admin.ts'
import { installedFrom } from './helpers/plugins.ts'

type Setup = (ctx: PluginContext) => void

/** A server with one plugin per setup, each added in the admin area, and an admin key for cron. */
async function withPlugins(...setups: Setup[]) {
  const installed = installedFrom(
    Object.fromEntries(
      setups.map((setup, i) => [
        `@test/p${i}`,
        { factory: () => definePlugin({ id: `p${i}`, name: `P${i}`, apiVersion: 1, setup }) },
      ]),
    ),
  )
  const h = await adminHarness({ installed })
  for (const i of setups.keys()) await h.call('POST', '/admin/plugins', { package: `@test/p${i}` })
  const { key } = (await h.call('POST', '/admin/api-keys', { label: 'cron', roles: ['admin'] }))
    .body as { key: string }
  const run = () =>
    h.app.request('/api/cron', { method: 'POST', headers: { authorization: `Bearer ${key}` } })
  return { ...h, run }
}

describe('cron', () => {
  it("runs every plugin's cron hook and records the run, listing the plugins that failed", async () => {
    const ran = vi.fn()
    const h = await withPlugins(
      (ctx) =>
        ctx.hooks.on('cron', () => {
          throw new Error('boom')
        }),
      (ctx) => ctx.hooks.on('cron', ran),
    )
    expect((await h.call('GET', '/admin/cron')).body.lastRun).toBeNull()
    const res = await h.run()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ failed: ['p0'] })
    expect(ran).toHaveBeenCalledWith({ startedAt: expect.any(String) })
    expect((await h.call('GET', '/admin/cron')).body.lastRun).toMatchObject({
      finishedAt: expect.any(String),
      failed: ['p0'],
    })
  })

  it('refuses a run while one is going', async () => {
    let finish!: () => void
    const h = await withPlugins((ctx) =>
      ctx.hooks.on('cron', () => new Promise<void>((resolve) => (finish = resolve))),
    )
    const first = h.run()
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect((await h.run()).status).toBe(409)
    finish()
    expect((await first).status).toBe(200)
  })
})

describe('signIn:before', () => {
  const invite = { registration: 'invite', inviteRoles: ['member'] }

  it('lets plugins set roles before the access check', async () => {
    const h = await withPlugins((ctx) =>
      ctx.hooks.on('signIn:before', async ({ did }: ActionHooks['signIn:before']) => {
        await ctx.roles.addMember('member', did)
      }),
    )
    await h.call('POST', '/admin/roles', { name: 'member' })
    await h.call('PUT', '/admin/access', invite)
    expect((await h.signIn('did:plc:alice')).headers.get('location')).toBe('/')
  })

  it('goes ahead with sign-in when a handler fails', async () => {
    const h = await withPlugins((ctx) =>
      ctx.hooks.on('signIn:before', () => {
        throw new Error('registry down')
      }),
    )
    expect((await h.signIn('did:plc:alice')).headers.get('location')).toBe('/')
  })
})
