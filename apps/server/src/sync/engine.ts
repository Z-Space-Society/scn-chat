import { parseCid } from '@atproto/lex-data'
import { RepoCommit, verifyCommit } from '@atproto/space'
import { atproto, isRecordNsid, nsid, validateRecord } from '@scn-chat/lexicons'
import { type Account, getAccount } from '../auth/accounts.ts'
import { isLoopbackUrl } from '../auth/oauth-client.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { Loose } from '../loose.ts'
import type { ChatService } from '../storage/chat-service.ts'
import { type OpsPage, type RecordStore, SpaceNotFound } from '../storage/record-store.ts'
import type { JsonRecord } from '../storage/records.ts'
import type { ChatServices } from '../storage/services.ts'
import { Coalescer } from './coalescer.ts'
import type { CredentialCache } from './credentials.ts'
import type { SyncEventBus } from './events.ts'
import { serviceId } from './identity.ts'
import type { RecentWrites } from './recent-writes.ts'

export type SyncEngineDeps = {
  db: Db
  services: ChatServices
  events: SyncEventBus
  recentWrites: RecentWrites
  credentials: CredentialCache
  resolveSigningKey: (did: string) => Promise<string>
  publicUrl: string
  logger: Logger
  /** How old a synced message asking for a reply can be, read on each use. */
  backfillWindowMs: () => number
  /** Whether the server may act for the user. Users without access are never synced. */
  hasAccess: (did: string) => Promise<boolean>
  now?: () => number
}

type Context = { account: Account; chats: ChatService; store: RecordStore }

/** Keeps sync cursors for spaces users and turns their PDS changes into events. It stores no content. */
export class SyncEngine {
  private readonly deps: SyncEngineDeps
  private readonly coalescer = new Coalescer()
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(deps: SyncEngineDeps) {
    this.deps = deps
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private async context(did: string): Promise<Context | null> {
    const account = await getAccount(this.deps.db, did)
    if (account?.storageMode !== 'space') return null
    if (!(await this.deps.hasAccess(did))) {
      this.deps.logger.debug({ did }, 'not syncing a user without access')
      return null
    }
    const chats = this.deps.services.forAccount(account)
    return { account, chats, store: chats.store }
  }

  /** Serialize work per key. */
  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    this.locks.set(key, next)
    return next.finally(() => {
      if (this.locks.get(key) === next) this.locks.delete(key)
    })
  }

  private async state(space: string) {
    return this.deps.db
      .selectFrom('sync_state')
      .selectAll()
      .where('space_uri', '=', space)
      .executeTakeFirst()
  }

  private async saveState(
    space: string,
    owner: string,
    changes: {
      last_rev?: string | null
      registered_until?: string | null
      last_error?: string | null
    },
  ) {
    const row = { ...changes, last_synced_at: new Date(this.now()).toISOString() }
    await this.deps.db
      .insertInto('sync_state')
      .values({
        space_uri: space,
        owner_did: owner,
        last_rev: null,
        registered_until: null,
        last_error: null,
        ...row,
      })
      .onConflict((oc) => oc.column('space_uri').doUpdateSet(row))
      .execute()
  }

  private async dropState(space: string) {
    await this.deps.db.deleteFrom('sync_state').where('space_uri', '=', space).execute()
  }

  /** Sync a user's chat index, coalescing bursts of requests. */
  syncIndex(did: string): Promise<void> {
    return this.coalescer.request(`index ${did}`, () => this.runIndexSync(did, false))
  }

  /** Sync one conversation now. */
  async syncConversation(did: string, skey: string): Promise<void> {
    const ctx = await this.context(did)
    if (ctx) await this.runConversationSync(ctx, skey, false)
  }

  private runIndexSync(did: string, verify: boolean): Promise<void> {
    return this.lock(`index ${did}`, async () => {
      const ctx = await this.context(did)
      if (!ctx) return
      const space = ctx.chats.settingsUri
      const state = await this.state(space)
      if (!state?.last_rev) return this.firstIndexSync(ctx)
      const page = await ctx.store.listOps(space, state.last_rev)
      for (const op of page.ops) {
        if (op.collection !== nsid.conversationRef) continue
        if (!op.cid) {
          await this.dropState(ctx.chats.conversationUri(op.rkey))
          this.deps.events.emit('conversation:deleted', { did, skey: op.rkey })
        } else if (!this.deps.recentWrites.has(op.cid)) {
          await this.runConversationSync(ctx, op.rkey, false)
        }
      }
      if (page.ops.some((op) => !op.cid || !this.deps.recentWrites.has(op.cid))) {
        this.deps.events.emit('index:changed', { did })
      }
      if (verify && !(await this.commitMatches(ctx, space, page))) {
        this.deps.logger.warn({ did, space }, 'chat index set hash mismatch, resetting cursor')
        return this.firstIndexSync(ctx)
      }
      await this.saveState(space, did, { last_rev: page.rev ?? state.last_rev, last_error: null })
    })
  }

  /** Start at the head of the op log, syncing only conversations changed within the backfill window. */
  private async firstIndexSync(ctx: Context): Promise<void> {
    const space = ctx.chats.settingsUri
    const head = await ctx.store.headRev(space)
    const { conversations } = await ctx.chats.listConversations()
    const cutoff = this.now() - this.deps.backfillWindowMs()
    for (const conversation of conversations) {
      if (Date.parse(conversation.updatedAt) >= cutoff)
        await this.runConversationSync(ctx, conversation.skey, false)
    }
    await this.saveState(space, ctx.account.did, { last_rev: head, last_error: null })
  }

  private runConversationSync(ctx: Context, skey: string, verify: boolean): Promise<void> {
    const space = ctx.chats.conversationUri(skey)
    return this.lock(`conversation ${space}`, async () => {
      const did = ctx.account.did
      const state = await this.state(space)
      const first = !state?.last_rev
      let page: OpsPage
      try {
        page = await ctx.store.listOps(space, state?.last_rev)
      } catch (err) {
        if (!(err instanceof SpaceNotFound)) throw err
        await this.dropState(space)
        this.deps.events.emit('conversation:deleted', { did, skey })
        return
      }
      let external = false
      for (const op of page.ops) {
        if (!op.cid) {
          external = true
          continue
        }
        // Skip records replaced by a later op in this page.
        if (!op.value) continue
        if (this.deps.recentWrites.has(op.cid)) continue
        external = true
        if (!isRecordNsid(op.collection)) continue
        const valid = validateRecord(op.collection, op.value)
        if (!valid.success) {
          this.deps.logger.warn(
            { space, rkey: op.rkey, error: valid.error },
            'synced record failed validation',
          )
          if (op.collection === nsid.message) {
            this.deps.events.emit('message:invalid', {
              did,
              skey,
              rkey: op.rkey,
              raw: op.value,
              error: valid.error,
            })
          }
          continue
        }
        if (op.collection === nsid.info) {
          await ctx.chats.syncRefTitle(skey, op.value.title as string | undefined)
        }
        if (op.collection !== nsid.message) continue
        this.deps.events.emit('message:changed', {
          did,
          skey,
          rkey: op.rkey,
          record: op.value as JsonRecord,
          cid: op.cid,
          kind: op.prev ? 'update' : 'create',
          live: !first,
        })
      }
      if (external) this.deps.events.emit('conversation:changed', { did, skey })
      if ((verify || first) && !(await this.commitMatches(ctx, space, page))) {
        this.deps.logger.warn({ space }, 'conversation set hash mismatch, clearing cursor')
        await this.saveState(space, did, { last_rev: null })
        return
      }
      await this.saveState(space, did, {
        last_rev: page.rev ?? state?.last_rev ?? null,
        last_error: null,
      })
    })
  }

  /** Check the op log's signed commit against the set hash of the space's current records. */
  async commitMatches(ctx: Context, space: string, page: OpsPage): Promise<boolean> {
    const commit = page.commit as Loose
    // No repo in the space yet, nothing to verify.
    if (!commit) return true
    const keys = await ctx.store.listKeys(space)
    const local = RepoCommit.fromRecords(
      keys.map((key) => ({
        collection: key.collection as Loose,
        rkey: key.rkey as Loose,
        cid: parseCid(key.cid),
      })),
    )
    if (!local.matches(commit)) return false
    const didKey = await this.deps.resolveSigningKey(ctx.account.did)
    return verifyCommit(
      commit,
      { space: space as Loose, author: ctx.account.did as Loose, rev: commit.rev },
      didKey,
    )
  }

  /** Register for write notifications on the user's settings space. */
  async registerIndex(did: string): Promise<void> {
    // A PDS can't reach a loopback URL, so it could never deliver the notifications.
    if (isLoopbackUrl(this.deps.publicUrl)) return
    const ctx = await this.context(did)
    if (!ctx) return
    const space = ctx.chats.settingsUri
    try {
      const { expiresAt } = await this.deps.credentials.withCredential(
        did,
        space,
        async (credential) => {
          const client: Loose = credential.client(ctx.account.pdsUrl, did)
          return client.call(atproto.space.registerNotify, {
            space,
            service: serviceId(this.deps.publicUrl),
          })
        },
      )
      await this.saveState(space, did, { registered_until: expiresAt, last_error: null })
    } catch (err) {
      this.deps.logger.warn({ err, did }, 'registerNotify failed')
      await this.saveState(space, did, {
        last_error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** Renew registrations with less than an hour left. */
  async renewRegistrations(): Promise<void> {
    const soon = new Date(this.now() + 60 * 60_000).toISOString()
    const rows = await this.deps.db
      .selectFrom('sync_state')
      .innerJoin('account', 'account.did', 'sync_state.owner_did')
      .select('sync_state.owner_did')
      .where('account.storage_mode', '=', 'space')
      .where('sync_state.space_uri', 'like', `%/space/${nsid.settings}/self`)
      .where((eb) =>
        eb.or([
          eb('sync_state.registered_until', 'is', null),
          eb('sync_state.registered_until', '<', soon),
        ]),
      )
      .execute()
    for (const row of rows) await this.registerIndex(row.owner_did)
  }

  /** Find conversations missing from the index, add their entries, and sync them. */
  async discover(did: string): Promise<void> {
    const ctx = await this.context(did)
    if (!ctx) return
    const [uris, { conversations }] = await Promise.all([
      ctx.store.listSpaces(nsid.conversation),
      ctx.chats.listConversations(),
    ])
    const known = new Set(conversations.map((conversation) => conversation.uri))
    for (const uri of uris) {
      if (known.has(uri)) continue
      const skey = ctx.chats.skeyOf(uri)
      try {
        await ctx.chats.repairRef(skey)
        await this.runConversationSync(ctx, skey, false)
      } catch (err) {
        this.deps.logger.warn({ err, did, skey }, 'could not add a discovered conversation')
        continue
      }
      this.deps.events.emit('index:changed', { did })
    }
  }

  /** Sync and verify a user's index, as the safety net does. */
  safetyNet(did: string): Promise<void> {
    return this.runIndexSync(did, true)
  }
}
