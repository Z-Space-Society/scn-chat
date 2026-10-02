import { nsid } from '@scn-chat/lexicons'
import { sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { buildScope } from '../../src/auth/scope.ts'
import { settingSchemas } from '../../src/settings/schemas.ts'
import {
  authDeps,
  fakeOAuth,
  fakeSession,
  LOGIN_STATE,
  loginCookie,
  ORIGIN,
  sessionCookie,
} from '../helpers/auth.ts'
import { testConfig } from '../helpers/config.ts'
import { spacesHarness } from '../helpers/spaces.ts'

type Json = Record<string, unknown>

async function setup(storageMode: 'space' | 'local', syncOptions = {}) {
  const h = await spacesHarness({ storageMode })
  const scope = storageMode === 'space' ? buildScope('raw') : 'atproto'
  const oauth = fakeOAuth({
    callback: vi.fn(async () => ({
      session: fakeSession('did:plc:alice', scope),
      state: LOGIN_STATE,
    })),
  })
  const engine = { syncConversation: vi.fn(async () => {}) }
  const app = createApp({
    config: testConfig(),
    db: h.db,
    logger: h.logger,
    auth: authDeps(h.db, { oauth }),
    storage: {
      db: h.db,
      services: h.services,
      events: h.events,
      engine: engine as never,
      sync: () => settingSchemas.sync.parse(syncOptions),
      logger: h.logger,
    },
  })
  const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
  const get = async (path: string) => {
    const res = await app.request(`/api${path}`, { headers: { cookie } })
    return { status: res.status, body: (await res.json()) as Json }
  }
  const send = async (method: string, path: string, body?: object) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: (await res.json()) as Json }
  }
  return { ...h, app, cookie, get, send, engine }
}

describe.each(['space', 'local'] as const)('chat API for a %s account', (mode) => {
  it('creates a conversation and lists it in the index', async () => {
    const { get, send } = await setup(mode)
    const created = await send('POST', '/conversations', { systemPrompt: 'Be brief' })
    expect(created.status).toBe(201)
    const list = await get('/conversations')
    expect(list.body.conversations).toMatchObject([{ skey: created.body.skey }])
    expect(list.body.rev).toBeTruthy()
  })

  it('returns a conversation with its info, and 404 for a missing one', async () => {
    const { get, send } = await setup(mode)
    const { body } = await send('POST', '/conversations', { systemPrompt: 'Be brief' })
    const conversation = await get(`/conversations/${body.skey}`)
    expect((conversation.body.info as Json).value).toMatchObject({ systemPrompt: 'Be brief' })
    expect((await get('/conversations/3zzzzzzzzzzzz')).status).toBe(404)
  })

  it('returns 404 for tags on a conversation that does not exist, without adding it to the index', async () => {
    const { get, send } = await setup(mode)
    expect((await send('PATCH', '/conversations/3zzzzzzzzzzzz', { tags: ['work'] })).status).toBe(
      404,
    )
    expect((await get('/conversations')).body.conversations).toEqual([])
  })

  it('refuses malformed and wrongly typed bodies with a 400', async () => {
    const { send, app, cookie } = await setup(mode)
    const { body } = await send('POST', '/conversations')
    expect((await send('PATCH', `/conversations/${body.skey}`, { tags: 'work' })).status).toBe(400)
    expect((await send('PUT', '/account', { backgroundSync: 'no' })).status).toBe(400)
    const res = await app.request('/api/preferences', {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: '{',
    })
    expect(res.status).toBe(400)
  })

  it('reports a stored info record that does not match its lexicon as a 502', async () => {
    const { get, send, db } = await setup(mode)
    const { body } = await send('POST', '/conversations')
    const bad = JSON.stringify({ $type: nsid.info, createdAt: 12 })
    await sql`update local_record set value_json = ${bad} where collection = ${nsid.info}`.execute(
      db,
    )
    const res = await get(`/conversations/${body.skey}`)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('InvalidStoredRecord')
  })

  it('returns only index changes since a revision', async () => {
    const { get, send } = await setup(mode)
    await send('POST', '/conversations')
    const { body: first } = await get('/conversations')
    const { body: second } = await send('POST', '/conversations')
    const changes = await get(`/conversations?since=${first.rev}`)
    expect(changes.body.conversations).toMatchObject([{ skey: second.skey }])
    expect(changes.body.full).toBe(false)
  })

  it('renames a conversation as the user, copying the title into the index', async () => {
    const { get, send } = await setup(mode)
    const { body } = await send('POST', '/conversations')
    await send('PATCH', `/conversations/${body.skey}`, { title: 'Tile quotes', tags: ['reno'] })
    const conversation = await get(`/conversations/${body.skey}`)
    expect((conversation.body.info as Json).value).toMatchObject({
      title: 'Tile quotes',
      titleSource: 'user',
    })
    expect((await get('/conversations')).body.conversations).toMatchObject([
      { title: 'Tile quotes', tags: ['reno'] },
    ])
  })

  it('deletes a conversation', async () => {
    const { get, send } = await setup(mode)
    const { body } = await send('POST', '/conversations')
    await send('DELETE', `/conversations/${body.skey}`)
    expect((await get('/conversations')).body.conversations).toEqual([])
  })

  it('returns keys and CIDs without record content', async () => {
    const { get, send } = await setup(mode)
    const { body } = await send('POST', '/conversations', { systemPrompt: 'secret words' })
    const keys = await get(`/conversations/${body.skey}/keys`)
    expect(keys.body.keys).toMatchObject([
      { collection: 'network.sharedcomputer.chat.info', rkey: 'self' },
    ])
    expect(JSON.stringify(keys.body)).not.toContain('secret words')
    expect((await get('/conversations/keys')).body.keys).toHaveLength(1)
  })

  it('round-trips preferences and rejects invalid ones', async () => {
    const { get, send } = await setup(mode)
    await send('PUT', '/preferences', { customInstructions: 'Use metric', generateTitles: false })
    expect((await get('/preferences')).body.preferences).toMatchObject({
      customInstructions: 'Use metric',
    })
    expect((await send('PUT', '/preferences', { generateTitles: 'yes' })).status).toBe(400)
  })
})

describe('account settings', () => {
  it('lets the user turn off background sync when the admin allows it', async () => {
    const { get, send } = await setup('space')
    expect((await get('/account')).body).toEqual({ backgroundSync: true, allowUserOptOut: true })
    await send('PUT', '/account', { backgroundSync: false })
    expect((await get('/account')).body.backgroundSync).toBe(false)
  })

  it('refuses to turn off background sync when the admin does not allow it', async () => {
    const { send } = await setup('space', { allowUserOptOut: false })
    expect((await send('PUT', '/account', { backgroundSync: false })).status).toBe(403)
  })
})

describe('sync on open and the sync button', () => {
  it('syncs a spaces conversation before returning it', async () => {
    const { get, send, engine } = await setup('space')
    const { body } = await send('POST', '/conversations')
    await get(`/conversations/${body.skey}`)
    expect(engine.syncConversation).toHaveBeenCalledWith('did:plc:alice', body.skey)
  })

  it('syncs when the sync button is pressed', async () => {
    const { send, engine } = await setup('space')
    const { body } = await send('POST', '/conversations')
    await send('POST', `/conversations/${body.skey}/sync`)
    expect(engine.syncConversation).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/events', () => {
  it('streams change events for the signed-in user only', async () => {
    const { app, cookie, events } = await setup('space')
    const controller = new AbortController()
    const res = await app.request('/api/events', { headers: { cookie }, signal: controller.signal })
    const reader = res.body?.getReader()
    if (!reader) throw new Error('no stream')
    events.emit('conversation:changed', { did: 'did:plc:bob', skey: 'nope' })
    events.emit('conversation:changed', { did: 'did:plc:alice', skey: '3aaaaaaaaaaaa' })
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('event: conversation-changed')
    expect(text).toContain('3aaaaaaaaaaaa')
    expect(text).not.toContain('nope')
    controller.abort()
  })
})
