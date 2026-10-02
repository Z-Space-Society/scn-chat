import { definePlugin } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { migrateToLatest } from '../src/db/migrate.ts'
import { writeInstances } from '../src/plugins/instances.ts'
import { SecretBox } from '../src/secrets.ts'
import { createServer } from '../src/server.ts'
import {
  fakeIdentity,
  fakeOAuth,
  fakeSession,
  LOGIN_STATE,
  loginCookie,
  sessionCookie,
} from './helpers/auth.ts'
import { TEST_SECRET_KEY, testConfig } from './helpers/config.ts'
import { createSqliteDb } from './helpers/db.ts'
import { installedFrom } from './helpers/plugins.ts'
import { fakeProvider } from './helpers/providers.ts'

async function build(packages: string[]) {
  const { provider } = fakeProvider()
  const db = createSqliteDb()
  await migrateToLatest(db)
  const box = new SecretBox(Buffer.from(TEST_SECRET_KEY, 'base64'))
  await writeInstances(
    db,
    box,
    packages.map((pkg, index) => ({
      id: `instance-${index}`,
      package: pkg,
      enabled: true,
      options: {},
      secrets: {},
    })),
    'did:plc:admin',
  )
  const server = await createServer({
    config: testConfig({ ADMIN_DIDS: 'did:plc:alice' }),
    db,
    logger: pino({ level: 'silent' }),
    installed: installedFrom({
      'fake-plugin': {
        factory: () =>
          definePlugin({
            id: 'fake',
            name: 'Fake',
            apiVersion: 1,
            setup: (ctx) => ctx.providers.register(provider),
          }),
      },
    }),
    oauth: fakeOAuth({
      callback: vi.fn(async () => ({
        session: fakeSession('did:plc:alice', 'atproto'),
        state: LOGIN_STATE,
      })),
    }),
    identity: fakeIdentity(),
    startBackgroundJobs: false,
  })
  return server
}

describe('createServer', () => {
  it('starts when a stored plugin is no longer installed, and reports it', async () => {
    const { app, close } = await build(['gone-plugin', 'fake-plugin'])
    const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
    const body = (await (
      await app.request('/api/admin/plugins', { headers: { cookie } })
    ).json()) as {
      instances: { package: string; status: string; error: string | null }[]
    }
    expect(body.instances.map((i) => [i.package, i.status])).toEqual([
      ['gone-plugin', 'failed'],
      ['fake-plugin', 'loaded'],
    ])
    expect(body.instances[0]?.error).toContain('gone-plugin')
    await close()
  })
})
