import { describe, expect, it } from 'vitest'
import { adminHarness } from '../helpers/admin.ts'
import { TEST_ADMIN } from '../helpers/config.ts'

type Harness = Awaited<ReturnType<typeof adminHarness>>

const cron = (h: Harness, key?: string, cookie?: string) =>
  h.app.request('/api/cron', {
    method: 'POST',
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
  })

const issue = async (h: Harness, roles = ['admin']) =>
  (await h.call('POST', '/admin/api-keys', { label: 'crontab', roles })).body as {
    id: string
    key: string
  }

describe('API keys', () => {
  it('returns a key once and stores only its hash', async () => {
    const h = await adminHarness()
    const { key } = await issue(h)
    const row = await h.db.selectFrom('api_key').selectAll().executeTakeFirstOrThrow()
    expect(row.key_hash).not.toContain(key)
    expect(JSON.stringify((await h.call('GET', '/admin/api-keys')).body)).not.toContain(key)
    expect(JSON.stringify((await h.call('GET', '/admin/api-keys')).body)).not.toContain(
      row.key_hash,
    )
  })

  it('opens a route to a key holding one of its roles, and records the use', async () => {
    const h = await adminHarness()
    const { key } = await issue(h)
    expect((await cron(h, key)).status).toBe(200)
    const [listed] = (await h.call('GET', '/admin/api-keys')).body.keys as { lastUsedAt: string }[]
    expect(listed?.lastUsedAt).toEqual(expect.any(String))
  })

  it('refuses a missing, unknown, or revoked key with 401, and a key without the role with 403', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/roles', { name: 'staff' })
    const { key: staffKey } = await issue(h, ['staff'])
    const { id, key } = await issue(h)
    await h.call('DELETE', `/admin/api-keys/${id}`)
    expect((await cron(h)).status).toBe(401)
    expect((await cron(h, 'scn_nope')).status).toBe(401)
    expect((await cron(h, key)).status).toBe(401)
    expect((await cron(h, staffKey)).status).toBe(403)
  })

  it('keeps keys and web sessions to their own routes', async () => {
    const h = await adminHarness()
    const { key } = await issue(h)
    const res = await h.signIn(TEST_ADMIN)
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    expect((await cron(h, undefined, cookie)).status).toBe(401)
    const admin = await h.app.request('/api/admin/users', {
      headers: { authorization: `Bearer ${key}` },
    })
    expect(admin.status).toBe(401)
  })

  it('refuses a role that does not exist, and deleting a role a key holds', async () => {
    const h = await adminHarness()
    expect((await h.call('POST', '/admin/api-keys', { label: 'x', roles: ['ghost'] })).status).toBe(
      400,
    )
    await h.call('POST', '/admin/roles', { name: 'staff' })
    await issue(h, ['staff'])
    const refused = await h.call('DELETE', '/admin/roles/staff')
    expect(refused.status).toBe(400)
    expect(refused.body.message).toContain('API key crontab')
  })
})
