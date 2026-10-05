import { nsid } from '@scn-chat/lexicons'
import { sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { recordLogin } from '../../src/auth/accounts.ts'
import { IdentityResolutionError } from '../../src/auth/identity.ts'
import { buildScope } from '../../src/auth/scope.ts'
import { SharingService } from '../../src/sharing/service.ts'
import { recordCid } from '../../src/storage/records.ts'
import { CredentialError } from '../../src/sync/credentials.ts'
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
import { spacesHarness, textContent } from '../helpers/spaces.ts'

const BOB = 'did:plc:bob'
const CAROL = 'did:plc:carol'
const LOCAL = 'did:plc:local'

async function setup() {
  const h = await spacesHarness()
  for (const did of [BOB, CAROL])
    await recordLogin(h.db, { did, handle: null, pdsUrl: 'https://pds.test', spacesAllowed: true })
  await recordLogin(h.db, {
    did: LOCAL,
    handle: null,
    pdsUrl: 'https://pds.test',
    spacesAllowed: false,
  })
  const handles: Record<string, string> = { 'bob.test': BOB, 'carol.test': CAROL }
  const identity = {
    resolve: vi.fn(async (did: string) => ({
      did,
      handle: Object.keys(handles).find((h) => handles[h] === did) ?? 'alice.test',
      pdsUrl: 'https://pds.test',
    })),
    resolveHandle: vi.fn(async (handle: string) => handles[handle] ?? null),
    resolveSigningKey: vi.fn(async () => 'did:key:x'),
  }
  const mintCredential = vi.fn(async (viewer: string, space: string) => {
    if (!h.pds.mayRead(space, viewer))
      throw new CredentialError('UserNotAuthorized', 'not a member')
    return { client: () => h.pds.client(h.pds.ownerOf(space)) }
  })
  const sharing = new SharingService({
    getPdsClient: async (did) => h.pds.client(did) as never,
    identity,
    mintCredential,
    logger: h.logger,
  })
  const appFor = async (did: string) => {
    const scope = did === LOCAL ? 'atproto' : buildScope('raw')
    const oauth = fakeOAuth({
      callback: vi.fn(async () => ({ session: fakeSession(did, scope), state: LOGIN_STATE })),
    })
    const app = createApp({
      config: testConfig(),
      db: h.db,
      logger: h.logger,
      auth: authDeps(h.db, { oauth, identity }),
      sharing,
    })
    const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
    return {
      raw: (path: string) => app.request(`/api${path}`, { headers: { cookie } }),
      get: async (path: string) => {
        const res = await app.request(`/api${path}`, { headers: { cookie } })
        return { status: res.status, body: (await res.json()) as Record<string, unknown> }
      },
      put: async (path: string, body: object) => {
        const res = await app.request(`/api${path}`, {
          method: 'PUT',
          headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        return { status: res.status, body: (await res.json()) as Record<string, unknown> }
      },
    }
  }
  const { skey, uri } = await h.chats.createConversation({ systemPrompt: 'secret system prompt' })
  await h.chats.updateInfo(skey, { title: 'Tile quotes', titleSource: 'user' })
  await h.chats.createMessage(skey, '3mmmmmmmmmmm1', {
    $type: nsid.message,
    role: 'user',
    content: textContent('hi'),
    createdAt: new Date().toISOString(),
  } as never)
  await h.chats.createMessage(skey, '3mmmmmmmmmmm1.r0', {
    $type: nsid.message,
    role: 'assistant',
    parent: '3mmmmmmmmmmm1',
    status: 'complete',
    content: textContent('hello'),
    createdAt: new Date().toISOString(),
  } as never)
  return { ...h, appFor, skey, uri, mintCredential, identity }
}

describe('share settings', () => {
  it('shares with people as read-only members and removes dropped members', async () => {
    const { appFor, skey, uri, pds } = await setup()
    const alice = await appFor('did:plc:alice')
    await alice.put(`/conversations/${skey}/sharing`, {
      mode: 'people',
      members: ['bob.test', CAROL],
    })
    expect(pds.policies.get(uri)?.members.get(BOB)).toEqual({ read: true, write: false })
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'people', members: [CAROL] })
    expect(pds.policies.get(uri)?.members.has(BOB)).toBe(false)
    expect((await alice.get(`/conversations/${skey}/sharing`)).body).toEqual({
      mode: 'people',
      members: [{ did: CAROL, handle: 'carol.test' }],
    })
  })

  it('makes a conversation public while keeping the member list, and private again removes everyone', async () => {
    const { appFor, skey, uri, pds } = await setup()
    const alice = await appFor('did:plc:alice')
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'people', members: [BOB] })
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'public' })
    expect(pds.policies.get(uri)?.readPolicy).toMatch(/publicPolicy/)
    expect(pds.policies.get(uri)?.members.has(BOB)).toBe(true)
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'private' })
    expect((await alice.get(`/conversations/${skey}/sharing`)).body).toEqual({
      mode: 'private',
      members: [],
    })
  })

  it('fails with 400 naming an unresolvable handle', async () => {
    const { appFor, skey } = await setup()
    const res = await (await appFor('did:plc:alice')).put(`/conversations/${skey}/sharing`, {
      mode: 'people',
      members: ['nobody.test'],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('nobody.test')
  })

  it('leaves a public conversation public when a handle cannot be resolved', async () => {
    const { appFor, skey, uri, pds } = await setup()
    const alice = await appFor('did:plc:alice')
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'public' })
    const res = await alice.put(`/conversations/${skey}/sharing`, {
      mode: 'people',
      members: ['nobody.test'],
    })
    expect(res.status).toBe(400)
    expect(pds.policies.get(uri)?.readPolicy).toMatch(/publicPolicy/)
  })

  it('refuses a member list that is not a list, or a member that looks like a DID but is not one', async () => {
    const { appFor, skey } = await setup()
    const alice = await appFor('did:plc:alice')
    const share = (members: unknown) =>
      alice.put(`/conversations/${skey}/sharing`, { mode: 'people', members })
    expect((await share('bob.test')).status).toBe(400)
    expect((await share(['did:nope'])).status).toBe(400)
  })

  it('returns 404 for the share settings of a conversation that does not exist', async () => {
    const { appFor } = await setup()
    const alice = await appFor('did:plc:alice')
    expect((await alice.get('/conversations/3zzzzzzzzzzzz/sharing')).status).toBe(404)
    expect(
      (await alice.put('/conversations/3zzzzzzzzzzzz/sharing', { mode: 'public' })).status,
    ).toBe(404)
  })

  it('reflects changes made outside the app', async () => {
    const { appFor, skey, uri, pds } = await setup()
    pds.policies.set(uri, {
      readPolicy: 'com.atproto.simplespace.defs#publicPolicy',
      members: new Map(),
    })
    expect(
      (await (await appFor('did:plc:alice')).get(`/conversations/${skey}/sharing`)).body.mode,
    ).toBe('public')
  })

  it('refuses fallback owners', async () => {
    const { appFor, skey } = await setup()
    const local = await appFor(LOCAL)
    expect((await local.get(`/conversations/${skey}/sharing`)).status).toBe(403)
    expect((await local.put(`/conversations/${skey}/sharing`, { mode: 'public' })).status).toBe(403)
  })
})

describe('shared view', () => {
  it('lets a member read a people-shared conversation through their own credential, without the system prompt', async () => {
    const { appFor, skey, mintCredential } = await setup()
    await (await appFor('did:plc:alice')).put(`/conversations/${skey}/sharing`, {
      mode: 'people',
      members: [BOB],
    })
    const view = await (await appFor(BOB)).get(`/shared/did:plc:alice/${skey}`)
    expect(view.status).toBe(200)
    expect(view.body).toMatchObject({ title: 'Tile quotes', owner: { did: 'did:plc:alice' } })
    expect((view.body.messages as { rkey: string }[]).map((m) => m.rkey)).toEqual([
      '3mmmmmmmmmmm1',
      '3mmmmmmmmmmm1.r0',
    ])
    expect(JSON.stringify(view.body)).not.toContain('secret system prompt')
    expect(mintCredential).toHaveBeenCalledWith(BOB, expect.stringContaining(skey))
  })

  it('leaves out a message another client wrote that does not match the lexicon', async () => {
    const { appFor, skey, uri, db } = await setup()
    await (await appFor('did:plc:alice')).put(`/conversations/${skey}/sharing`, { mode: 'public' })
    const value = { $type: nsid.message, role: 'user', createdAt: new Date().toISOString() }
    const bad = JSON.stringify(value)
    const cid = await recordCid(value)
    await sql`insert into local_record values (${uri}, ${nsid.message}, 'bad', ${bad}, ${cid}, 'now')`.execute(
      db,
    )
    const view = await (await appFor(BOB)).get(`/shared/did:plc:alice/${skey}`)
    expect((view.body.messages as { rkey: string }[]).map((m) => m.rkey)).not.toContain('bad')
  })

  it('returns 404 to a non-member, and to anyone for a private conversation', async () => {
    const { appFor, skey } = await setup()
    expect((await (await appFor(CAROL)).get(`/shared/did:plc:alice/${skey}`)).status).toBe(404)
    await (await appFor('did:plc:alice')).put(`/conversations/${skey}/sharing`, {
      mode: 'people',
      members: [BOB],
    })
    expect((await (await appFor(CAROL)).get(`/shared/did:plc:alice/${skey}`)).status).toBe(404)
  })

  it('returns 404 when the owner DID cannot be resolved', async () => {
    const { appFor, skey, identity } = await setup()
    const bob = await appFor(BOB)
    identity.resolve.mockRejectedValueOnce(new IdentityResolutionError('did:plc:gone', 'not found'))
    const view = await bob.get(`/shared/did:plc:gone/${skey}`)
    expect(view.status).toBe(404)
  })

  it('lets any spaces user read a public conversation', async () => {
    const { appFor, skey } = await setup()
    await (await appFor('did:plc:alice')).put(`/conversations/${skey}/sharing`, { mode: 'public' })
    expect((await (await appFor(CAROL)).get(`/shared/did:plc:alice/${skey}`)).status).toBe(200)
  })

  it('returns 404 for a missing conversation', async () => {
    const { appFor } = await setup()
    expect((await (await appFor(BOB)).get('/shared/did:plc:alice/3zzzzzzzzzzzz')).status).toBe(404)
  })

  it('takes a revocation into account on the next request', async () => {
    const { appFor, skey } = await setup()
    const alice = await appFor('did:plc:alice')
    const bob = await appFor(BOB)
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'people', members: [BOB] })
    expect((await bob.get(`/shared/did:plc:alice/${skey}`)).status).toBe(200)
    await alice.put(`/conversations/${skey}/sharing`, { mode: 'private' })
    expect((await bob.get(`/shared/did:plc:alice/${skey}`)).status).toBe(404)
  })

  it('refuses fallback viewers with 403', async () => {
    const { appFor, skey } = await setup()
    await (await appFor('did:plc:alice')).put(`/conversations/${skey}/sharing`, { mode: 'public' })
    expect((await (await appFor(LOCAL)).get(`/shared/did:plc:alice/${skey}`)).status).toBe(403)
  })

  it('loads an attachment in a shared conversation through the viewer credential', async () => {
    const h = await setup()
    const upload = (await h.pds
      .client('did:plc:alice')
      .call({ $nsid: 'com.atproto.repo.uploadBlob' }, new Uint8Array([7, 7]) as never, {
        encoding: 'image/png',
      })) as { blob: { ref: { toString(): string } } }
    const cid = upload.blob.ref.toString()
    await h.chats.createMessage(h.skey, '3mmmmmmmmmmm2', {
      $type: nsid.message,
      role: 'user',
      content: {
        $type: `${nsid.defs}#plainContent`,
        parts: [
          {
            $type: `${nsid.defs}#imagePart`,
            image: { $type: 'blob', ref: { $link: cid }, mimeType: 'image/png', size: 2 },
          },
        ],
      },
      createdAt: new Date().toISOString(),
    } as never)
    const carol = await h.appFor(CAROL)
    expect((await carol.raw(`/shared/did:plc:alice/${h.skey}/blobs/${cid}`)).status).toBe(404)
    await (await h.appFor('did:plc:alice')).put(`/conversations/${h.skey}/sharing`, {
      mode: 'people',
      members: [BOB],
    })
    const res = await (await h.appFor(BOB)).raw(
      `/shared/did:plc:alice/${h.skey}/blobs/${cid}?type=image/png`,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([7, 7]))
  })

  it('returns 401 when signed out', async () => {
    const h = await spacesHarness()
    const app = createApp({
      config: testConfig(),
      db: h.db,
      logger: h.logger,
      sharing: {} as never,
    })
    expect((await app.request('/api/shared/did:plc:alice/3aaaaaaaaaaaa')).status).toBe(401)
  })
})
