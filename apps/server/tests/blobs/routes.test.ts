import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { buildScope } from '../../src/auth/scope.ts'
import { createBlobStores } from '../../src/blobs/store.ts'
import { IngesterRegistry } from '../../src/plugins/registry.ts'
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

async function setup(storageMode: 'space' | 'local') {
  const h = await spacesHarness({ storageMode })
  const stores = createBlobStores({
    getPdsClient: async (did) => h.pds.client(did) as never,
    dataDir: mkdtempSync(join(tmpdir(), 'scn-')),
    db: h.db,
  })
  const ingesters = new IngesterRegistry()
  ingesters.register(
    {
      id: 'pdf-text',
      accepts: ['application/pdf'],
      method: 'text',
      ingest: async ({ bytes }) => {
        const text = new TextDecoder().decode(bytes)
        if (text.includes('SCAN')) throw new Error('This PDF has no text layer')
        return { text: `extracted: ${text}` }
      },
    },
    'test',
  )
  ingesters.register(
    {
      id: 'huge-text',
      accepts: ['application/x-huge'],
      method: 'text',
      ingest: async () => ({ text: 'x'.repeat(20_000_001) }),
    },
    'test',
  )
  const scope = storageMode === 'space' ? buildScope('raw') : 'atproto'
  const oauth = fakeOAuth({
    callback: vi.fn(async () => ({
      session: fakeSession('did:plc:alice', scope),
      state: LOGIN_STATE,
    })),
  })
  const app = createApp({
    config: testConfig(),
    db: h.db,
    logger: h.logger,
    auth: authDeps(h.db, { oauth }),
    blobs: {
      blobsFor: stores.forAccount,
      services: h.services,
      ingesters: () => ingesters,
      logger: h.logger,
    },
  })
  const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
  const upload = async (bytes: Uint8Array, type: string, name = 'file') => {
    const res = await app.request('/api/attachments', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN, 'content-type': type, 'x-filename': name },
      body: bytes,
    })
    return {
      status: res.status,
      body: (await res.json()) as { part?: Record<string, unknown>; message?: string },
    }
  }
  return { ...h, app, cookie, upload }
}

describe.each(['space', 'local'] as const)('attachments for a %s account', (mode) => {
  it('turns an uploaded image into an image part whose blob the conversation can serve once referenced', async () => {
    const { upload, chats, app, cookie } = await setup(mode)
    const { status, body } = await upload(new Uint8Array([137, 80, 78, 71]), 'image/png', 'pic.png')
    expect(status).toBe(201)
    expect(body.part).toMatchObject({
      $type: 'network.sharedcomputer.chat.defs#imagePart',
      image: { $type: 'blob', mimeType: 'image/png' },
    })
    const { skey } = await chats.createConversation()
    await chats.createMessage(skey, '3mmmmmmmmmmm1', {
      $type: 'network.sharedcomputer.chat.message',
      role: 'user',
      content: { $type: 'network.sharedcomputer.chat.defs#plainContent', parts: [body.part] },
      createdAt: new Date().toISOString(),
    } as never)
    const cid = (body.part!.image as { ref: { $link: string } }).ref.$link
    const res = await app.request(`/api/conversations/${skey}/blobs/${cid}?type=image/png`, {
      headers: { cookie },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it('extracts text from a PDF and stores it as a text/plain blob with method text', async () => {
    const { upload } = await setup(mode)
    const { status, body } = await upload(
      new TextEncoder().encode('%PDF body'),
      'application/pdf',
      'report.pdf',
    )
    expect(status).toBe(201)
    expect(body.part).toMatchObject({
      $type: 'network.sharedcomputer.chat.defs#filePart',
      name: 'report.pdf',
      file: { mimeType: 'application/pdf' },
      extracted: { method: 'text', text: { mimeType: 'text/plain' } },
    })
  })

  it('fails with a clear message for a PDF without text', async () => {
    const { upload } = await setup(mode)
    const { status, body } = await upload(new TextEncoder().encode('SCAN'), 'application/pdf')
    expect(status).toBe(422)
    expect(body.message).toMatch(/no text layer/)
  })

  it('refuses an unsupported type with 415', async () => {
    const { upload } = await setup(mode)
    expect((await upload(new Uint8Array([1]), 'text/csv')).status).toBe(415)
  })

  it('refuses an image over 20 MB with 413', async () => {
    const { upload } = await setup(mode)
    expect((await upload(new Uint8Array(20_000_001), 'image/png')).status).toBe(413)
  })

  it('refuses an oversize upload sent without a content length', async () => {
    const { app, cookie } = await setup(mode)
    const chunk = new Uint8Array(1_000_000)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ > 21) controller.close()
        else controller.enqueue(chunk)
      },
    })
    const res = await app.request('/api/attachments', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN, 'content-type': 'image/png' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect(res.status).toBe(413)
  })

  it('refuses a file whose text is more than a message can hold', async () => {
    const { upload } = await setup(mode)
    expect((await upload(new Uint8Array([1]), 'application/x-huge')).status).toBe(413)
  })

  it('refuses a file name that is not URI-encoded', async () => {
    const { upload } = await setup(mode)
    expect((await upload(new Uint8Array([1]), 'application/pdf', '%E0%A4%A')).status).toBe(400)
  })

  it('lists the file types the installed ingesters can read', async () => {
    const { app, cookie } = await setup(mode)
    const res = await app.request('/api/attachments/types', { headers: { cookie } })
    expect(((await res.json()) as { files: string[] }).files).toEqual([
      'application/pdf',
      'application/x-huge',
    ])
  })
})

describe('blob route', () => {
  it('returns 404 for a blob not referenced in the conversation', async () => {
    const { upload, chats, app, cookie } = await setup('space')
    const { body } = await upload(new Uint8Array([1, 2]), 'image/png')
    const { skey } = await chats.createConversation()
    const cid = (body.part!.image as { ref: { $link: string } }).ref.$link
    expect(
      (await app.request(`/api/conversations/${skey}/blobs/${cid}`, { headers: { cookie } }))
        .status,
    ).toBe(404)
  })

  it('serves non-image blobs as downloads', async () => {
    const { upload, app, cookie } = await setup('local')
    const { body } = await upload(new TextEncoder().encode('%PDF body'), 'application/pdf')
    const cid = (body.part!.file as { ref: { $link: string } }).ref.$link
    const res = await app.request(`/api/conversations/3aaaaaaaaaaaa/blobs/${cid}`, {
      headers: { cookie },
    })
    expect(res.headers.get('content-disposition')).toBe('attachment')
  })
})
