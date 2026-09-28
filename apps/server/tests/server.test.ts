import { definePlugin } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createServer } from '../src/server.ts'
import {
  fakeIdentity,
  fakeOAuth,
  fakeSession,
  LOGIN_STATE,
  loginCookie,
  ORIGIN,
  sessionCookie,
} from './helpers/auth.ts'
import { testConfig } from './helpers/config.ts'
import { createSqliteDb } from './helpers/db.ts'
import { fakeProvider } from './helpers/providers.ts'

const caps = { vision: false, reasoning: false, tools: false }

async function build() {
  const { provider } = fakeProvider()
  const server = await createServer({
    config: testConfig(),
    appConfig: {
      plugins: [
        definePlugin({
          id: 'fake',
          name: 'Fake',
          apiVersion: 1,
          setup: (ctx) => ctx.providers.register(provider),
        }),
      ],
      models: [
        {
          provider: 'fake',
          id: 'm',
          name: 'M',
          capabilities: caps,
          roles: ['user'],
          default: true,
        },
      ],
    },
    db: createSqliteDb(),
    logger: pino({ level: 'silent' }),
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
  it('wires every route: health, identity, OAuth, and the signed-in API', async () => {
    const { app, close } = await build()
    expect((await app.request('/api/health')).status).toBe(200)
    expect((await app.request('/.well-known/did.json')).status).toBe(200)
    expect((await app.request('/oauth-client-metadata.json')).status).toBe(200)
    const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
    const models = (await (await app.request('/api/models', { headers: { cookie } })).json()) as {
      models: { id: string }[]
    }
    expect(models.models.map((m) => m.id)).toEqual(['m'])
    const created = await app.request('/api/conversations', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN },
    })
    expect(created.status).toBe(201)
    await close()
  })

  it('fails to start when an admin model names an unregistered provider', async () => {
    await expect(
      createServer({
        config: testConfig(),
        appConfig: {
          plugins: [],
          models: [{ provider: 'ghost', id: 'm', name: 'M', capabilities: caps, roles: ['user'] }],
        },
        db: createSqliteDb(),
        logger: pino({ level: 'silent' }),
        oauth: fakeOAuth(),
        identity: fakeIdentity(),
        startBackgroundJobs: false,
      }),
    ).rejects.toThrow(/ghost/)
  })
})
