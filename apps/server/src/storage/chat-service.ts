import { nsid } from '@scn-chat/lexicons'
import type { InfoPatch } from '@scn-chat/plugin-api'
import type { Logger } from '../logger.ts'
import {
  type Op,
  type OpsPage,
  type RecordKey,
  type RecordStore,
  SpaceExists,
  type StoredRecord,
} from './record-store.ts'
import { type JsonRecord, newTid, parseSpaceUri, spaceUri } from './records.ts'
import { assertValidStored, keepValid } from './validate.ts'

export const SETTINGS_SKEY = 'self'

/** Get the record written by a key's newest op. */
function currentRecord(op: Op): StoredRecord {
  if (!op.cid || !op.value)
    throw new Error(`The newest op for ${op.collection}/${op.rkey} has no record value`)
  return { rkey: op.rkey, value: op.value, cid: op.cid }
}

export type ConversationSummary = {
  skey: string
  uri: string
  title: string | null
  tags: string[]
  updatedAt: string
  cid: string
}

export type ConversationChanges = {
  info: StoredRecord | null
  messages: StoredRecord[]
  deleted: { collection: string; rkey: string }[]
  rev: string | null
  full: boolean
}

export type IndexChanges = {
  conversations: ConversationSummary[]
  deleted: string[]
  rev: string | null
  full: boolean
}

/** Chat operations for one user, keeping their chat index in step with every write. */
export class ChatService {
  readonly did: string
  readonly store: RecordStore
  readonly settingsUri: string
  private readonly logger: Logger
  private readonly onWrite: (space: string, cid: string) => void

  constructor(
    store: RecordStore,
    logger: Logger,
    onWrite: (space: string, cid: string) => void = () => {},
  ) {
    this.did = store.did
    this.store = store
    this.logger = logger
    this.onWrite = onWrite
    this.settingsUri = spaceUri(store.did, nsid.settings, SETTINGS_SKEY)
  }

  conversationUri(skey: string): string {
    return spaceUri(this.did, nsid.conversation, skey)
  }

  async ensureSettingsSpace(): Promise<void> {
    try {
      await this.store.createSpace(nsid.settings, SETTINGS_SKEY)
    } catch (err) {
      if (!(err instanceof SpaceExists)) throw err
    }
  }

  private async put(
    space: string,
    collection: string,
    rkey: string,
    value: JsonRecord,
    create = false,
  ) {
    const { cid } = create
      ? await this.store.createRecord(space, collection, rkey, value)
      : await this.store.putRecord(space, collection, rkey, value)
    this.onWrite(space, cid)
    return cid
  }

  async createConversation(input: { systemPrompt?: string; tags?: string[] } = {}) {
    const skey = newTid()
    const uri = await this.store.createSpace(nsid.conversation, skey)
    const now = new Date().toISOString()
    const info: JsonRecord = { $type: nsid.info, createdAt: now }
    if (input.systemPrompt) info.systemPrompt = input.systemPrompt
    await this.put(uri, nsid.info, 'self', info)
    await this.ensureSettingsSpace()
    await this.writeRef(skey, { tags: input.tags ?? [] })
    return { skey, uri }
  }

  private async readRef(skey: string): Promise<JsonRecord | undefined> {
    return (await this.store.getRecord(this.settingsUri, nsid.conversationRef, skey))?.value
  }

  private async writeRef(
    skey: string,
    changes: { title?: string | null; tags?: string[] },
  ): Promise<void> {
    const existing = (await this.readRef(skey)) ?? {}
    const ref: JsonRecord = {
      ...existing,
      $type: nsid.conversationRef,
      conversation: this.conversationUri(skey),
      updatedAt: new Date().toISOString(),
    }
    if (changes.title === null) delete ref.title
    else if (changes.title !== undefined) ref.title = changes.title
    if (changes.tags !== undefined) ref.tags = changes.tags
    await this.put(this.settingsUri, nsid.conversationRef, skey, ref)
  }

  /** Bump the index entry, logging failures for discovery to repair. */
  private async touchRef(skey: string): Promise<void> {
    try {
      await this.writeRef(skey, {})
    } catch (err) {
      this.logger.warn(
        { err, conversation: this.conversationUri(skey) },
        'chat index update failed',
      )
    }
  }

  async createMessage(skey: string, rkey: string, record: JsonRecord): Promise<string> {
    const cid = await this.put(this.conversationUri(skey), nsid.message, rkey, record, true)
    await this.touchRef(skey)
    return cid
  }

  async putMessage(skey: string, rkey: string, record: JsonRecord): Promise<string> {
    const cid = await this.put(this.conversationUri(skey), nsid.message, rkey, record)
    await this.touchRef(skey)
    return cid
  }

  /** Read a record and check it against its lexicon. */
  private async getValid(space: string, collection: string, rkey: string) {
    const record = await this.store.getRecord(space, collection, rkey)
    if (record) assertValidStored(space, collection, rkey, record.value)
    return record
  }

  async getInfo(skey: string): Promise<JsonRecord | null> {
    return (await this.getValid(this.conversationUri(skey), nsid.info, 'self'))?.value ?? null
  }

  async updateInfo(
    skey: string,
    patch: InfoPatch,
    options: { unlessUserTitled?: boolean } = {},
  ): Promise<boolean> {
    const info = await this.getInfo(skey)
    if (!info) return false
    if (options.unlessUserTitled && info.titleSource === 'user') return false
    const next: JsonRecord = { ...info, ...patch, $type: nsid.info }
    await this.put(this.conversationUri(skey), nsid.info, 'self', next)
    if (patch.title !== undefined) await this.writeRef(skey, { title: patch.title })
    else await this.touchRef(skey)
    return true
  }

  /** Add a missing index entry, with the title from the conversation's info record. */
  async repairRef(skey: string): Promise<void> {
    const title = (await this.getInfo(skey))?.title as string | undefined
    await this.writeRef(skey, title === undefined ? {} : { title })
  }

  /** Copy the info title into the index entry when the two differ. */
  async syncRefTitle(skey: string, title: string | undefined): Promise<void> {
    const ref = await this.readRef(skey)
    if (ref && ref.title !== title) await this.writeRef(skey, { title: title ?? null })
  }

  async setTags(skey: string, tags: string[]): Promise<void> {
    await this.writeRef(skey, { tags })
  }

  async deleteConversation(skey: string): Promise<void> {
    await this.store.deleteSpace(this.conversationUri(skey))
    await this.store.deleteRecord(this.settingsUri, nsid.conversationRef, skey)
  }

  async getPreferences(): Promise<JsonRecord | null> {
    return (await this.getValid(this.settingsUri, nsid.preferences, 'self'))?.value ?? null
  }

  async putPreferences(record: JsonRecord): Promise<void> {
    await this.ensureSettingsSpace()
    await this.put(this.settingsUri, nsid.preferences, 'self', {
      ...record,
      $type: nsid.preferences,
      updatedAt: new Date().toISOString(),
    })
  }

  private summary(record: StoredRecord): ConversationSummary {
    const value = record.value as {
      conversation: string
      title?: string
      tags?: string[]
      updatedAt: string
    }
    return {
      skey: record.rkey,
      uri: value.conversation,
      title: value.title ?? null,
      tags: value.tags ?? [],
      updatedAt: value.updatedAt,
      cid: record.cid,
    }
  }

  /** Get the chat index, newest first, or its changes since a revision. */
  async listConversations(since?: string | null): Promise<IndexChanges> {
    if (since) {
      const page = await this.store.listOps(this.settingsUri, since)
      const refs = page.ops.filter((op) => op.collection === nsid.conversationRef)
      const latest = [...new Map(refs.map((op) => [op.rkey, op])).values()]
      const changed = latest.filter((op) => op.cid).map(currentRecord)
      return {
        conversations: keepValid(this.settingsUri, nsid.conversationRef, changed, this.logger).map(
          (record) => this.summary(record),
        ),
        deleted: latest.filter((op) => !op.cid).map((op) => op.rkey),
        rev: page.rev,
        full: false,
      }
    }
    const [records, rev] = await Promise.all([
      this.store.listRecords(this.settingsUri, nsid.conversationRef),
      this.store.headRev(this.settingsUri),
    ])
    const conversations = keepValid(
      this.settingsUri,
      nsid.conversationRef,
      records,
      this.logger,
    ).map((record) => this.summary(record))
    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { conversations, deleted: [], rev, full: true }
  }

  /** Get a conversation's info and messages, or their changes since a revision. */
  async getConversation(skey: string, since?: string | null): Promise<ConversationChanges> {
    const uri = this.conversationUri(skey)
    if (since) {
      const page: OpsPage = await this.store.listOps(uri, since)
      const latest = [
        ...new Map(page.ops.map((op) => [`${op.collection}/${op.rkey}`, op])).values(),
      ]
      const info = latest.find((op) => op.collection === nsid.info && op.cid)
      if (info) assertValidStored(uri, nsid.info, info.rkey, currentRecord(info).value)
      const messages = latest.filter((op) => op.collection === nsid.message && op.cid)
      return {
        info: info ? currentRecord(info) : null,
        messages: keepValid(uri, nsid.message, messages.map(currentRecord), this.logger),
        deleted: latest
          .filter((op) => !op.cid)
          .map((op) => ({ collection: op.collection, rkey: op.rkey })),
        rev: page.rev,
        full: false,
      }
    }
    const [info, messages, rev] = await Promise.all([
      this.getValid(uri, nsid.info, 'self'),
      this.store.listRecords(uri, nsid.message),
      this.store.headRev(uri),
    ])
    return {
      info,
      messages: keepValid(uri, nsid.message, messages, this.logger),
      deleted: [],
      rev,
      full: true,
    }
  }

  listKeys(skey?: string): Promise<RecordKey[]> {
    return this.store.listKeys(skey ? this.conversationUri(skey) : this.settingsUri)
  }

  skeyOf(uri: string): string {
    return parseSpaceUri(uri).skey
  }
}
