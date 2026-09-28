import {
  DidNotFoundError,
  PoorlyFormattedDidError,
  UnsupportedDidMethodError,
} from '@atproto/identity'
import { isValidDid } from '@atproto/syntax'
import { atproto, nsid } from '@scn-chat/lexicons'
import type { Account } from '../auth/accounts.ts'
import { IdentityResolutionError, type IdentityResolver } from '../auth/identity.ts'
import type { PdsClientFactory } from '../auth/pds.ts'
import { lexErrorCode } from '../lex-errors.ts'
import type { Logger } from '../logger.ts'
import type { Loose } from '../loose.ts'
import { SpaceNotFound } from '../storage/record-store.ts'
import { type JsonRecord, spaceUri, toJson } from '../storage/records.ts'
import { MEMBER_LIST, PUBLIC } from '../storage/space-policies.ts'
import { assertValidStored, keepValid } from '../storage/validate.ts'
import { CredentialError } from '../sync/credentials.ts'

export type ShareMode = 'private' | 'people' | 'public'
export type ShareSettings = { mode: ShareMode; members: { did: string; handle: string | null }[] }

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

  /** Run an owner's space management call, reporting a missing space as SpaceNotFound. */
  private async managing<T>(space: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (lexErrorCode(err) === 'SpaceNotFound') throw new SpaceNotFound(space)
      throw err
    }
  }

  async getSettings(account: Account, skey: string): Promise<ShareSettings> {
    const space = spaceUri(account.did, nsid.conversation, skey)
    return this.managing(space, () => this.readSettings(account, space))
  }

  private async readSettings(account: Account, space: string): Promise<ShareSettings> {
    const client = await this.owner(account)
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
        if (member.startsWith('did:')) {
          if (!isValidDid(member)) throw new ShareInputError(`"${member}" is not a valid DID`)
          return member
        }
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
    const wanted = mode === 'people' ? await this.toDids(members) : []
    const space = spaceUri(account.did, nsid.conversation, skey)
    await this.managing(space, () => this.applySettings(account, space, mode, wanted))
  }

  private async applySettings(account: Account, space: string, mode: ShareMode, wanted: string[]) {
    const client = await this.owner(account)
    const current = await this.members(client, space)
    if (mode === 'public') {
      await client.call(atproto.simplespace.updateSpace, { space, readPolicy: PUBLIC })
      return
    }
    await client.call(atproto.simplespace.updateSpace, { space, readPolicy: MEMBER_LIST })
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
        DENIED.has(lexErrorCode(err) ?? '') ||
        err instanceof IdentityResolutionError ||
        err instanceof DidNotFoundError ||
        err instanceof PoorlyFormattedDidError ||
        err instanceof UnsupportedDidMethodError
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
      if (DENIED.has(lexErrorCode(err) ?? '')) throw new SharedNotFound()
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
