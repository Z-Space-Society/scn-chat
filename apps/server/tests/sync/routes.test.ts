import { Secp256k1Keypair } from '@atproto/crypto'
import { createServiceJwt } from '@atproto/xrpc-server'
import { nsid } from '@scn-chat/lexicons'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { recordLogin } from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { SyncEventBus } from '../../src/sync/events.ts'
import { appDid, serviceId } from '../../src/sync/identity.ts'
import { testConfig } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'

const PUBLIC_URL = 'https://chat.example.com'
const ALICE = 'did:plc:alice'
const settings = `at://${ALICE}/space/${nsid.settings}/self`
const conversation = `at://${ALICE}/space/${nsid.conversation}/3aaaaaaaaaaaa`

async function setup(options: { keyLookupFails?: boolean } = {}) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  await recordLogin(db, {
    did: ALICE,
    handle: null,
    pdsUrl: 'https://pds.test',
    spacesAllowed: true,
  })
  await recordLogin(db, {
    did: 'did:plc:local',
    handle: null,
    pdsUrl: 'https://pds.test',
    spacesAllowed: false,
  })
  const keypair = await Secp256k1Keypair.create()
  const engine = { syncIndex: vi.fn(async () => {}), syncConversation: vi.fn(async () => {}) }
  const app = createApp({
    config: testConfig(),
    db,
    logger: pino({ level: 'silent' }),
    sync: {
      db,
      engine: engine as never,
      events: new SyncEventBus(),
      publicUrl: PUBLIC_URL,
      resolveSigningKey: async () => {
        if (options.keyLookupFails) throw new Error('plc.directory is down')
        return keypair.did()
      },
      logger: pino({ level: 'silent' }),
    },
  })
  const token = (iss: string, aud: string, lxm: string) =>
    createServiceJwt({ iss: iss as never, aud, lxm: lxm as never, keypair })
  const post = async (path: string, body: object, jwt: string) =>
    app.request(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  return { app, engine, token, post }
}

describe('GET /.well-known/did.json', () => {
  it('publishes the service entry', async () => {
    const { app } = await setup()
    const doc = (await (await app.request('/.well-known/did.json')).json()) as {
      service: { id: string }[]
    }
    expect(doc.service[0]?.id).toBe('#scn_chat')
  })
})

describe('POST notifyWrite', () => {
  const lxm = 'com.atproto.space.notifyWrite'

  it('syncs the index for a valid settings-space notification', async () => {
    const { post, token, engine } = await setup()
    const res = await post(
      `/xrpc/${lxm}`,
      { space: settings },
      await token(ALICE, serviceId(PUBLIC_URL), lxm),
    )
    expect(res.status).toBe(200)
    expect(engine.syncIndex).toHaveBeenCalledWith(ALICE)
  })

  it('returns 400 for a body without a space', async () => {
    const { post, token } = await setup()
    const res = await post(`/xrpc/${lxm}`, {}, await token(ALICE, serviceId(PUBLIC_URL), lxm))
    expect(res.status).toBe(400)
  })

  it('reports a failed key lookup as a server error', async () => {
    const { post, token } = await setup({ keyLookupFails: true })
    const res = await post(
      `/xrpc/${lxm}`,
      { space: settings },
      await token(ALICE, serviceId(PUBLIC_URL), lxm),
    )
    expect(res.status).toBe(500)
  })

  it('returns 401 for the wrong audience', async () => {
    const { post, token } = await setup()
    expect(
      (
        await post(
          `/xrpc/${lxm}`,
          { space: settings },
          await token(ALICE, 'did:web:other.test#scn_chat', lxm),
        )
      ).status,
    ).toBe(401)
  })

  it('returns 401 for the wrong method', async () => {
    const { post, token } = await setup()
    expect(
      (
        await post(
          `/xrpc/${lxm}`,
          { space: settings },
          await token(ALICE, serviceId(PUBLIC_URL), 'com.atproto.space.other'),
        )
      ).status,
    ).toBe(401)
  })

  it('returns 401 when the issuer is not the space authority', async () => {
    const { post, token } = await setup()
    expect(
      (
        await post(
          `/xrpc/${lxm}`,
          { space: settings },
          await token('did:plc:mallory', serviceId(PUBLIC_URL), lxm),
        )
      ).status,
    ).toBe(401)
  })
})

describe('POST requestSync', () => {
  const lxm = nsid.requestSync

  it('syncs the named conversation for its owner', async () => {
    const { post, token, engine } = await setup()
    const res = await post(
      `/xrpc/${lxm}`,
      { conversation },
      await token(ALICE, appDid(PUBLIC_URL), lxm),
    )
    expect(res.status).toBe(200)
    expect(engine.syncConversation).toHaveBeenCalledWith(ALICE, '3aaaaaaaaaaaa')
  })

  it('syncs the whole index without a conversation', async () => {
    const { post, token, engine } = await setup()
    await post(`/xrpc/${lxm}`, {}, await token(ALICE, appDid(PUBLIC_URL), lxm))
    expect(engine.syncIndex).toHaveBeenCalledWith(ALICE)
  })

  it('fails with UnknownConversation for someone else conversation', async () => {
    const { post, token } = await setup()
    const other = `at://did:plc:bob/space/${nsid.conversation}/3aaaaaaaaaaaa`
    const res = await post(
      `/xrpc/${lxm}`,
      { conversation: other },
      await token(ALICE, appDid(PUBLIC_URL), lxm),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'UnknownConversation' })
  })

  it('refuses a caller who is not a spaces account', async () => {
    const { post, token } = await setup()
    expect(
      (await post(`/xrpc/${lxm}`, {}, await token('did:plc:local', appDid(PUBLIC_URL), lxm)))
        .status,
    ).toBe(401)
  })

  it('refuses a token for another method', async () => {
    const { post, token } = await setup()
    expect(
      (
        await post(
          `/xrpc/${lxm}`,
          {},
          await token(ALICE, appDid(PUBLIC_URL), 'com.atproto.space.notifyWrite'),
        )
      ).status,
    ).toBe(401)
  })
})
