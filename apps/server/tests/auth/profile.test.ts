import { describe, expect, it, vi } from 'vitest'
import { createProfileReader } from '../../src/auth/profile.ts'

const CID = 'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy'
const DID = 'did:plc:alice'

/** A PDS that answers getRecord with `record`, or 400 when it is undefined. */
function fakePds(record?: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/xrpc/com.atproto.repo.getRecord') {
      expect(url.origin).toBe('https://pds.test')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        repo: DID,
        collection: 'app.bsky.actor.profile',
        rkey: 'self',
      })
      if (!record) return Response.json({ error: 'RecordNotFound' }, { status: 400 })
      return Response.json({ uri: 'at://x', value: record })
    }
    return new Response(null, { status: 404 })
  }) as unknown as typeof fetch
}

const reader = (pdsFetch: typeof fetch) =>
  createProfileReader({ resolvePds: async () => 'https://pds.test', fetch: pdsFetch })

const avatar = { $type: 'blob', ref: { $link: CID }, mimeType: 'image/jpeg', size: 3 }

describe('createProfileReader', () => {
  it('reads the display name and avatar thumbnail from the profile record', async () => {
    const profile = await reader(fakePds({ displayName: '  Alice  ', avatar })).read(DID)
    expect(profile).toEqual({
      displayName: 'Alice',
      avatar: `https://cdn.bsky.app/img/avatar_thumbnail/plain/${DID}/${CID}@jpeg`,
    })
  })

  it('answers with nulls for a user with no profile record', async () => {
    expect(await reader(fakePds()).read(DID)).toEqual({ displayName: null, avatar: null })
  })

  it('ignores an avatar that is not a PNG or JPEG, or has no valid CID', async () => {
    const svg = { ...avatar, mimeType: 'image/svg+xml' }
    expect((await reader(fakePds({ avatar: svg })).read(DID)).avatar).toBeNull()
    const bad = { ...avatar, ref: { $link: 'not-a-cid' } }
    expect((await reader(fakePds({ avatar: bad })).read(DID)).avatar).toBeNull()
  })
})
