import { validateCidString } from '@atproto/lex-data'

/**
 * The user's public atproto profile: Bluesky's `app.bsky.actor.profile` record, which most
 * atproto accounts carry. These NSIDs are Bluesky's and public PDS methods, not lexicons of this
 * app, so they are named here rather than in the generated module.
 */
const PROFILE_COLLECTION = 'app.bsky.actor.profile'
const GET_RECORD = 'com.atproto.repo.getRecord'
/**
 * Bluesky's image CDN, which serves a small JPEG of any avatar it has indexed. The browser loads it
 * from there, since the PDS's blob is the full upload, often far larger than the sidebar needs.
 */
const AVATAR_THUMBNAIL = 'https://cdn.bsky.app/img/avatar_thumbnail/plain'

/** The profile avatar types the lexicon accepts. */
const AVATAR_TYPES = new Set(['image/png', 'image/jpeg'])
const MAX_DISPLAY_NAME = 640

export type Profile = {
  displayName: string | null
  /** The avatar's thumbnail on Bluesky's CDN. */
  avatar: string | null
}

export type ProfileReaderDeps = {
  resolvePds: (did: string) => Promise<string>
  fetch: typeof fetch
}

export interface ProfileReader {
  /** The user's display name and avatar, or nulls when they have no profile record. */
  read(did: string): Promise<Profile>
}

/**
 * Read a user's profile from their PDS on each request. Nothing is kept: the PDS stays the only
 * copy, and the browser's own cache holds the avatar.
 */
export function createProfileReader(deps: ProfileReaderDeps): ProfileReader {
  return {
    async read(did) {
      const pds = await deps.resolvePds(did)
      const url = new URL(`/xrpc/${GET_RECORD}`, pds)
      url.search = new URLSearchParams({
        repo: did,
        collection: PROFILE_COLLECTION,
        rkey: 'self',
      }).toString()
      const res = await deps.fetch(url, { headers: { accept: 'application/json' } })
      // A user who never set up a profile has no record, which the PDS answers with a 400.
      if (res.status === 400 || res.status === 404) return { displayName: null, avatar: null }
      if (!res.ok) throw new Error(`Reading the profile returned ${res.status}`)
      const value = ((await res.json()) as { value?: Record<string, unknown> }).value ?? {}
      return {
        displayName: displayName(value.displayName),
        avatar: avatarThumbnail(did, value.avatar),
      }
    },
  }
}

function displayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, MAX_DISPLAY_NAME)
  return trimmed || null
}

/** The thumbnail of the avatar blob, when the record has a usable image avatar. */
function avatarThumbnail(did: string, value: unknown): string | null {
  const blob = value as { ref?: { $link?: unknown }; mimeType?: unknown } | undefined
  const cid = blob?.ref?.$link
  const mimeType = blob?.mimeType
  if (typeof cid !== 'string' || !validateCidString(cid)) return null
  if (typeof mimeType !== 'string' || !AVATAR_TYPES.has(mimeType)) return null
  return `${AVATAR_THUMBNAIL}/${did}/${cid}@jpeg`
}
