import { describe, expect, it } from 'vitest'
import { adminHarness } from '../helpers/admin.ts'

describe('settings routes', () => {
  it('saves a setting, and refuses an invalid one with its issues', async () => {
    const h = await adminHarness()
    const bad = await h.call('PUT', '/admin/settings/turns', { maxSteps: 0 })
    expect(bad.status).toBe(400)
    expect(bad.body.issues).toEqual([expect.objectContaining({ path: ['maxSteps'] })])
    const good = await h.call('PUT', '/admin/settings/general', { appName: 'Renamed' })
    expect(good.body).toEqual({ value: { appName: 'Renamed' } })
    expect(h.settings.get('general').appName).toBe('Renamed')
    expect(await (await h.app.request('/oauth-client-metadata.json')).json()).not.toHaveProperty(
      'client_name',
    )
  })

  it('does not edit access, or settings that do not exist, through the forms', async () => {
    const h = await adminHarness()
    expect((await h.call('PUT', '/admin/settings/access', { registration: 'closed' })).status).toBe(
      404,
    )
    expect((await h.call('PUT', '/admin/settings/nope', {})).status).toBe(404)
  })

  it('applies a new session lifetime to new sessions and leaves existing ones alone', async () => {
    const h = await adminHarness()
    await h.call('PUT', '/admin/settings/sessions', { ttlDays: 2 })
    const res = await h.signIn('did:plc:admin')
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=172800/)
    const rows = await h.db.selectFrom('web_session').select(['created_at', 'expires_at']).execute()
    const lifetimes = rows.map((r) => Date.parse(r.expires_at) - Date.parse(r.created_at))
    expect(lifetimes.sort()).toEqual([2 * 86_400_000, 30 * 86_400_000])
  })
})
