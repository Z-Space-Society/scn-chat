import { nsid } from '@scn-chat/lexicons/nsid'
import { type SearchResult, search } from './search.ts'
import type { SqlDb } from './sql.ts'

type Json = Record<string, unknown>

export type ConversationSummary = {
  skey: string
  uri: string
  title: string | null
  tags: string[]
  updatedAt: string
}
export type StoredMessage = { rkey: string; author: string; record: Json; cid: string }
export type Conversation = { skey: string; info: Json | null; messages: StoredMessage[] }

export type IndexChanges = {
  conversations: (ConversationSummary & { cid: string })[]
  deleted: string[]
  rev: string | null
  full: boolean
}
export type ConversationChanges = {
  info: { value: Json; cid: string } | null
  messages: { rkey: string; value: Json; cid: string }[]
  deleted: { collection: string; rkey: string }[]
  rev: string | null
  full: boolean
}
export type RecordKey = { collection: string; rkey: string; cid: string }

/** How the store talks to the server, which reads from the user's PDS on its behalf. */
export interface StoreApi {
  fetchIndex(since?: string | null): Promise<IndexChanges>
  fetchConversation(skey: string, since?: string | null): Promise<ConversationChanges>
  fetchKeys(skey?: string): Promise<RecordKey[]>
}

export type StoreChange = { type: 'index' } | { type: 'conversation'; skey: string }

const MESSAGE = nsid.message
const INFO = nsid.info

/** Join a message's text parts, for search. */
export function messageText(record: Json): string {
  // Encrypted content has no parts.
  const content = record.content as { parts?: { $type: string; text?: string }[] }
  return (content.parts ?? [])
    .filter((part) => part.$type.endsWith('#textPart'))
    .map((part) => part.text as string)
    .join('\n')
}

/** The user's chats on this device, kept in step with their PDS through the server. */
export class StoreCore {
  private readonly db: SqlDb
  private readonly api: StoreApi
  private readonly did: string
  private readonly notify: (change: StoreChange) => void
  private readonly now: () => string

  constructor(options: {
    db: SqlDb
    api: StoreApi
    did: string
    notify?: (change: StoreChange) => void
    now?: () => string
  }) {
    this.db = options.db
    this.api = options.api
    this.did = options.did
    this.notify = options.notify ?? (() => {})
    this.now = options.now ?? (() => new Date().toISOString())
  }

  private meta(key: string): string | null {
    return (
      this.db.all<{ value: string }>('select value from meta where key = ?', [key])[0]?.value ??
      null
    )
  }

  private setMeta(key: string, value: string | null): void {
    if (value === null) this.db.run('delete from meta where key = ?', [key])
    else
      this.db.run(
        'insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value',
        [key, value],
      )
  }

  listConversations(): ConversationSummary[] {
    return this.db
      .all<{
        skey: string
        uri: string
        title: string | null
        tags_json: string
        updated_at: string
      }>(
        'select skey, uri, title, tags_json, updated_at from conversation order by updated_at desc',
      )
      .map((row) => ({
        skey: row.skey,
        uri: row.uri,
        title: row.title,
        tags: JSON.parse(row.tags_json) as string[],
        updatedAt: row.updated_at,
      }))
  }

  getConversation(skey: string): Conversation {
    const info = this.db.all<{ record_json: string }>(
      'select record_json from info where conversation_skey = ?',
      [skey],
    )[0]
    const messages = this.db
      .all<{ rkey: string; author_did: string; record_json: string; cid: string }>(
        'select rkey, author_did, record_json, cid from message where conversation_skey = ? order by rkey',
        [skey],
      )
      .map((row) => ({
        rkey: row.rkey,
        author: row.author_did,
        record: JSON.parse(row.record_json) as Json,
        cid: row.cid,
      }))
    return { skey, info: info ? (JSON.parse(info.record_json) as Json) : null, messages }
  }

  /** Fetch the chat index, or only its changes since the stored revision. */
  async syncIndex(): Promise<void> {
    const changes = await this.api.fetchIndex(this.meta('index_rev'))
    this.applyIndex(changes)
  }

  applyIndex(changes: IndexChanges): void {
    this.db.transaction(() => {
      if (changes.full) {
        const keep = new Set(changes.conversations.map((c) => c.skey))
        for (const { skey } of this.db.all<{ skey: string }>('select skey from conversation')) {
          if (!keep.has(skey)) this.dropConversation(skey)
        }
      }
      for (const skey of changes.deleted) this.dropConversation(skey)
      for (const c of changes.conversations) {
        this.db.run(
          `insert into conversation (skey, uri, title, tags_json, updated_at, ref_cid) values (?, ?, ?, ?, ?, ?)
           on conflict (skey) do update set uri = excluded.uri, title = excluded.title, tags_json = excluded.tags_json,
           updated_at = excluded.updated_at, ref_cid = excluded.ref_cid`,
          [c.skey, c.uri, c.title, JSON.stringify(c.tags), c.updatedAt, c.cid],
        )
      }
      if (changes.rev) this.setMeta('index_rev', changes.rev)
    })
    if (changes.full || changes.conversations.length || changes.deleted.length)
      this.notify({ type: 'index' })
  }

  private dropConversation(skey: string): void {
    this.db.run('delete from message where conversation_skey = ?', [skey])
    this.db.run('delete from info where conversation_skey = ?', [skey])
    this.db.run('delete from conversation where skey = ?', [skey])
  }

  removeConversation(skey: string): void {
    this.db.transaction(() => this.dropConversation(skey))
    this.notify({ type: 'index' })
  }

  /** Fetch a conversation's changes since its stored revision, or all of it the first time. */
  async refreshConversation(skey: string, options: { full?: boolean } = {}): Promise<void> {
    const rev = options.full ? null : this.revOf(skey)
    const changes = await this.api.fetchConversation(skey, rev)
    this.applyConversation(skey, changes)
  }

  private revOf(skey: string): string | null {
    return (
      this.db.all<{ rev: string | null }>('select rev from conversation where skey = ?', [skey])[0]
        ?.rev ?? null
    )
  }

  applyConversation(skey: string, changes: ConversationChanges): void {
    this.db.transaction(() => {
      if (changes.full) {
        this.db.run('delete from message where conversation_skey = ?', [skey])
        this.db.run('delete from info where conversation_skey = ?', [skey])
      }
      for (const deleted of changes.deleted) {
        if (deleted.collection === MESSAGE) {
          this.db.run('delete from message where conversation_skey = ? and rkey = ?', [
            skey,
            deleted.rkey,
          ])
        }
      }
      if (changes.info) {
        this.db.run(
          'insert into info (conversation_skey, record_json, cid) values (?, ?, ?) on conflict (conversation_skey) do update set record_json = excluded.record_json, cid = excluded.cid',
          [skey, JSON.stringify(changes.info.value), changes.info.cid],
        )
      }
      for (const message of changes.messages) {
        const record = message.value
        this.db.run(
          `insert into message (conversation_skey, author_did, rkey, role, parent, status, record_json, text, cid, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           on conflict (conversation_skey, author_did, rkey) do update set role = excluded.role, parent = excluded.parent,
           status = excluded.status, record_json = excluded.record_json, text = excluded.text, cid = excluded.cid`,
          [
            skey,
            this.did,
            message.rkey,
            record.role as string,
            (record.parent as string | undefined) ?? null,
            (record.status as string | undefined) ?? null,
            JSON.stringify(record),
            messageText(record),
            message.cid,
            record.createdAt as string,
          ],
        )
      }
      this.db.run('update conversation set rev = coalesce(?, rev), fetched_at = ? where skey = ?', [
        changes.rev,
        this.now(),
        skey,
      ])
    })
    this.notify({ type: 'conversation', skey })
  }

  /** Compare every key and CID with the server's, and refetch whatever differs. */
  async reconcileConversation(skey: string): Promise<void> {
    const remote = await this.api.fetchKeys(skey)
    const local = new Map<string, string>()
    for (const row of this.db.all<{ rkey: string; cid: string }>(
      'select rkey, cid from message where conversation_skey = ?',
      [skey],
    )) {
      local.set(`${MESSAGE}/${row.rkey}`, row.cid)
    }
    for (const row of this.db.all<{ cid: string }>(
      'select cid from info where conversation_skey = ?',
      [skey],
    )) {
      local.set(`${INFO}/self`, row.cid)
    }
    const relevant = remote.filter((key) => key.collection === MESSAGE || key.collection === INFO)
    const differs =
      relevant.length !== local.size ||
      relevant.some((key) => local.get(`${key.collection}/${key.rkey}`) !== key.cid)
    if (differs) await this.refreshConversation(skey, { full: true })
  }

  async reconcileIndex(): Promise<void> {
    const remote = await this.api.fetchKeys()
    const refs = remote.filter((key) => key.collection === nsid.conversationRef)
    const local = new Map(
      this.db
        .all<{ skey: string; ref_cid: string | null }>('select skey, ref_cid from conversation')
        .map((r) => [r.skey, r.ref_cid]),
    )
    const differs =
      refs.length !== local.size || refs.some((key) => local.get(key.rkey) !== key.cid)
    if (differs) this.applyIndex(await this.api.fetchIndex(null))
  }

  /** List conversations that were never fetched or have changed since, newest first. */
  staleConversations(): string[] {
    return this.db
      .all<{ skey: string }>(
        'select skey from conversation where fetched_at is null or updated_at > fetched_at order by updated_at desc',
      )
      .map((row) => row.skey)
  }

  /** How many conversations are left to download before search covers them all. */
  remainingDownloads(): number {
    return this.staleConversations().length
  }

  search(query: string, options?: { limit?: number; offset?: number }): SearchResult[] {
    return search(this.db, query, options)
  }

  /** Fetch every stale conversation, a few at a time, so search covers the whole history. */
  async backgroundDownload(concurrency = 2): Promise<void> {
    const queue = this.staleConversations()
    const worker = async () => {
      for (let skey = queue.shift(); skey; skey = queue.shift()) {
        // Skip a conversation that fails, and fetch it again on the next download.
        await this.refreshConversation(skey).catch((err: unknown) =>
          console.warn('Downloading a conversation failed', skey, err),
        )
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  }

  /** React to a server event about this user's chats. */
  async handleEvent(event: { type: string; skey?: string }): Promise<void> {
    if (event.type === 'index-changed') return this.syncIndex()
    if (!event.skey) throw new Error(`A ${event.type} event arrived without a conversation`)
    if (event.type === 'conversation-changed') await this.refreshConversation(event.skey)
    else if (event.type === 'conversation-deleted') this.removeConversation(event.skey)
  }
}
