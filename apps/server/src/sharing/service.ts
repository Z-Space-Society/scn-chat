import { LexError } from '@atproto/lex-data'
import { atproto, nsid } from '@scn-chat/lexicons'
import type { Account } from '../auth/accounts.ts'
import type { IdentityResolver } from '../auth/identity.ts'
import type { PdsClientFactory } from '../auth/pds.ts'
import type { Logger } from '../logger.ts'
import { type JsonRecord, spaceUri, toJson } from '../storage/records.ts'
import { assertValidStored, keepValid } from '../storage/validate.ts'
import { CredentialError } from '../sync/credentials.ts'

// Plain strings don't satisfy the generated methods' branded string types.
type Loose = any

export type ShareMode = 'private' | 'people' | 'public'
export type ShareSettings = { mode: ShareMode; members: { did: string; handle: string | null }[] }

const PUBLIC = { $type: 'com.atproto.simplespace.defs#publicPolicy' }
const MEMBER_LIST = { $type: 'com.atproto.simplespace.defs#memberListPolicy' }

export class ShareInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareInputError'
  }
}

/** The conversation is missing, private, deleted, or the viewer is not allowed: all look the same. */
export class SharedNotFound extends Error {
  constructor() {
    super('Conversation not found')
    this.name = 'SharedNotFound'
  }
}

type CredentialClient = { client(service: string): Loose }

export type SharingDeps = {
  getPdsClient: PdsClientFactory
  identity: IdentityResolver
  /** Get a fresh, uncached space credential acting for the viewer. */
  mintCredential: (viewerDid: string, space: string) => Promise<CredentialClient>
  logger: Logger
}

const DENIED = new Set([
  'UserNotAuthorized',
  'AppNotAuthorized',
  'NotAuthorized',
  'SpaceNotFound',
  'SpaceDeleted',
  'RecordNotFound',
  'BlobNotFound',
  'RepoNotFound',
])

/** Share settings for an owner's conversations, and shared views read with the viewer's credential. */
export class SharingService {
  private readonly deps: SharingDeps

  constructor(deps: SharingDeps) {
    this.deps = deps
  }

  private async owner(account: Account): Promise<Loose> {
    return this.deps.getPdsClient(account.did)
  }

  private async members(client: Loose, space: string): Promise<string[]> {
    const dids: string[] = []
    let cursor: string | undefined
    do {
      const out = await client.call(atproto.simplespace.listMembers, { space, cursor, limit: 100 })
      dids.push(
        ...out.members.filter((m: { read: boolean }) => m.read).map((m: { did: string }) => m.did),
      )
      cursor = out.cursor
    } while (cursor)
    return dids
  }

  async getSettings(account: Account, skey: string): Promise<ShareSettings> {
    const client = await this.owner(account)
    const space = spaceUri(account.did, nsid.conversation, skey)
    const [config, dids] = await Promise.all([
      client.call(atproto.simplespace.getSpace, { space }),
      this.members(client, space),
    ])
    const isPublic = (config.readPolicy.$type as string).endsWith('#publicPolicy')
    const members = await Promise.all(
      dids.map(async (did) => ({
        did,
        handle: await this.deps.identity.resolve(did).then(
          (identity) => identity.handle,
          (err) => {
            this.deps.logger.warn({ err, did }, 'could not resolve a shared member handle')
            return null
          },
        ),
      })),
    )
    return { mode: isPublic ? 'public' : members.length ? 'people' : 'private', members }
  }

  private async toDids(members: string[]): Promise<string[]> {
    return Promise.all(
      members.map(async (member) => {
        if (member.startsWith('did:')) return member
        const did = await this.deps.identity.resolveHandle(member.replace(/^@/, ''))
        if (!did) throw new ShareInputError(`Cannot find the handle "${member}"`)
        return did
      }),
    )
  }

  async setSettings(
    account: Account,
    skey: string,
    mode: ShareMode,
    members: string[] = [],
  ): Promise<void> {
    const client = await this.owner(account)
    const space = spaceUri(account.did, nsid.conversation, skey)
    const current = await this.members(client, space)
    if (mode === 'public') {
      await client.call(atproto.simplespace.updateSpace, { space, readPolicy: PUBLIC })
      return
    }
    await client.call(atproto.simplespace.updateSpace, { space, readPolicy: MEMBER_LIST })
    const wanted = mode === 'people' ? await this.toDids(members) : []
    for (const did of current.filter((d) => !wanted.includes(d))) {
      await client.call(atproto.simplespace.removeMember, { space, did })
    }
    for (const did of wanted.filter((d) => !current.includes(d))) {
      await client.call(atproto.simplespace.putMember, { space, did, read: true, write: false })
    }
  }

  private async viewerClient(viewer: Account, ownerDid: string, skey: string) {
    const space = spaceUri(ownerDid, nsid.conversation, skey)
    try {
      const [credential, owner] = await Promise.all([
        this.deps.mintCredential(viewer.did, space),
        this.deps.identity.resolve(ownerDid),
      ])
      return { space, client: credential.client(owner.pdsUrl), ownerHandle: owner.handle }
    } catch (err) {
      if (
        (err instanceof CredentialError && DENIED.has(err.code)) ||
        (err instanceof LexError && DENIED.has(err.error))
      ) {
        throw new SharedNotFound()
      }
      throw err
    }
  }

  private async read(fn: () => Promise<Loose>): Promise<Loose> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof LexError && DENIED.has(err.error)) throw new SharedNotFound()
      throw err
    }
  }

  /** A conversation shared with the viewer, without its system prompt or the owner's preferences. */
  async view(viewer: Account, ownerDid: string, skey: string) {
    const { space, client, ownerHandle } = await this.viewerClient(viewer, ownerDid, skey)
    const info = await this.read(() =>
      client.call(atproto.space.getRecord, {
        space,
        repo: ownerDid,
        collection: nsid.info,
        rkey: 'self',
      }),
    )
    const messages: { rkey: string; value: JsonRecord; cid: string }[] = []
    let cursor: string | undefined
    do {
      const out = await this.read(() =>
        client.call(atproto.space.listRecords, {
          space,
          repo: ownerDid,
          collection: nsid.message,
          cursor,
          limit: 100,
        }),
      )
      for (const record of out.records) {
        messages.push({ rkey: record.rkey, value: toJson(record.value), cid: record.cid })
      }
      cursor = out.cursor
    } while (cursor)
    const infoValue = toJson(info.value)
    assertValidStored(space, nsid.info, 'self', infoValue)
    return {
      owner: { did: ownerDid, handle: ownerHandle },
      title: (infoValue.title as string | undefined) ?? null,
      messages: keepValid(space, nsid.message, messages, this.deps.logger),
    }
  }

  async blob(viewer: Account, ownerDid: string, skey: string, cid: string): Promise<Uint8Array> {
    const { space, client } = await this.viewerClient(viewer, ownerDid, skey)
    return this.read(() => client.call(atproto.space.getBlob, { space, repo: ownerDid, cid }))
  }
}
