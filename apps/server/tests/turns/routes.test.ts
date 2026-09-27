import { nsid } from '@scn-chat/lexicons'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { buildScope } from '../../src/auth/scope.ts'
import { authDeps, fakeOAuth, fakeSession, ORIGIN, sessionCookie } from '../helpers/auth.ts'
import { testConfig } from '../helpers/config.ts'
import { scriptedModel, textReply, turnsHarness } from '../helpers/turns.ts'

const text = (value: string) => ({ $type: `${nsid.defs}#textPart`, text: value })

async function setup(options: Parameters<typeof turnsHarness>[0] = {}) {
  const h = await turnsHarness(options)
  const oauth = fakeOAuth({
    callback: vi.fn(async () => ({ session: fakeSession('did:plc:alice', buildScope('raw')) })),
  })
  const app = createApp({
    config: testConfig(),
    db: h.db,
    logger: h.logger,
    auth: authDeps(h.db, { oauth }),
    turns: { services: h.services, runner: h.runner, hub: h.hub },
  })
  const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b'))
  const post = async (path: string, body: object = {}) => {
    const res = await app.request(`/api${path}`, {
      method: 'POST',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }
  const { skey } = await h.chats.createConversation()
  return { ...h, app, cookie, post, skey }
}

describe('POST /api/conversations/:skey/messages', () => {
  it('writes the user message and starts a turn when asked for a reply', async () => {
    const { post, skey, runner, messages } = await setup()
    const res = await post(`/conversations/${skey}/messages`, {
      parts: [text('hi')],
      generation: {},
    })
    expect(res.status).toBe(201)
    expect(res.body.replyRkey).toBe(`${res.body.rkey}.r0`)
    await runner.idle()
    expect((await messages(skey)).get(String(res.body.replyRkey))?.status).toBe('complete')
  })

  it('writes only the user message without a generation request', async () => {
    const { post, skey, messages } = await setup()
    const res = await post(`/conversations/${skey}/messages`, { parts: [text('note to self')] })
    expect(res.body.replyRkey).toBeNull()
    expect((await messages(skey)).size).toBe(1)
  })

  it('refuses assistant parts or an empty message', async () => {
    const { post, skey } = await setup()
    expect((await post(`/conversations/${skey}/messages`, { parts: [] })).status).toBe(400)
    const reasoning = { $type: `${nsid.defs}#reasoningPart`, text: 'sneaky' }
    expect((await post(`/conversations/${skey}/messages`, { parts: [reasoning] })).status).toBe(400)
  })
})

describe('regenerate and cancel', () => {
  it('raises the attempt and writes the next reply', async () => {
    const { post, skey, runner, messages } = await setup()
    const sent = await post(`/conversations/${skey}/messages`, {
      parts: [text('hi')],
      generation: {},
    })
    await runner.idle()
    const res = await post(`/conversations/${skey}/messages/${sent.body.rkey}/regenerate`, {
      effort: 'high',
    })
    expect(res.body.replyRkey).toBe(`${sent.body.rkey}.r1`)
    await runner.idle()
    const user = (await messages(skey)).get(String(sent.body.rkey))
    expect(user?.generation).toMatchObject({ attempt: 1, effort: 'high' })
  })

  it('cancels a running reply', async () => {
    const { post, skey, runner, messages } = await setup({
      model: () => scriptedModel(textReply('slow reply here'), { delayMs: 30 }).model,
    })
    const sent = await post(`/conversations/${skey}/messages`, {
      parts: [text('hi')],
      generation: {},
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(
      (await post(`/conversations/${skey}/messages/${sent.body.replyRkey}/cancel`)).body.cancelled,
    ).toBe(true)
    await runner.idle()
    expect((await messages(skey)).get(String(sent.body.replyRkey))?.status).toBe('cancelled')
  })
})

describe('GET /api/conversations/:skey/messages/:rkey/stream', () => {
  it('reports an unknown status for a reply this server is not running', async () => {
    const { app, cookie, skey } = await setup()
    const res = await app.request(`/api/conversations/${skey}/messages/nothing.r0/stream`, {
      headers: { cookie },
    })
    expect(await res.text()).toContain('"status":"unknown"')
  })

  it('streams a running reply to the end', async () => {
    const { app, cookie, post, skey } = await setup({
      model: () => scriptedModel(textReply('stream me'), { delayMs: 10 }).model,
    })
    const sent = await post(`/conversations/${skey}/messages`, {
      parts: [text('hi')],
      generation: {},
    })
    const res = await app.request(
      `/api/conversations/${skey}/messages/${sent.body.replyRkey}/stream`,
      { headers: { cookie } },
    )
    const body = await res.text()
    expect(body).toContain('event: part-start')
    expect(body).toContain('event: delta')
    expect(body).toContain('"status":"complete"')
  })
})
