import { nsid } from '@scn-chat/lexicons'
import { sql } from 'kysely'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import type { Db } from '../../src/db/index.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { ChatService } from '../../src/storage/chat-service.ts'
import { LocalRecordStore } from '../../src/storage/local-record-store.ts'
import { InvalidStoredRecord } from '../../src/storage/record-store.ts'
import { recordCid } from '../../src/storage/records.ts'
import { dialects } from '../helpers/db.ts'

const did = 'did:plc:alice'
const logger = pino({ level: 'silent' })
const text = (value: string) => ({
  $type: `${nsid.defs}#plainContent`,
  parts: [{ $type: `${nsid.defs}#textPart`, text: value }],
})
const userMessage = (value: string) => ({
  $type: nsid.message,
  role: 'user',
  content: text(value),
  createdAt: new Date().toISOString(),
})

describe.each(dialects)('ChatService on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    const writes: string[] = []
    const chats = new ChatService(new LocalRecordStore(did, db), logger, (_space, cid) =>
      writes.push(cid),
    )
    return { db, chats, writes }
  }

  it('creates the space, its info record, and its index entry', async () => {
    const { chats, db } = await setup()
    const { skey, uri } = await chats.createConversation({
      systemPrompt: 'Be brief',
      tags: ['work'],
    })
    expect(uri).toBe(`at://${did}/space/${nsid.conversation}/${skey}`)
    expect((await chats.getInfo(skey))?.systemPrompt).toBe('Be brief')
    const { conversations } = await chats.listConversations()
    expect(conversations).toMatchObject([{ skey, uri, tags: ['work'] }])
    await db.destroy()
  })

  it('bumps the index entry when a message is written', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    const before = (await chats.listConversations()).conversations[0]?.updatedAt ?? ''
    await new Promise((resolve) => setTimeout(resolve, 5))
    await chats.createMessage(skey, '3mmmmmmmmmmmm', userMessage('hi'))
    const after = (await chats.listConversations()).conversations[0]?.updatedAt ?? ''
    expect(after > before).toBe(true)
    await db.destroy()
  })

  it('copies a title change into the index entry', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await chats.updateInfo(skey, { title: 'Tile quotes', titleSource: 'user' })
    expect((await chats.listConversations()).conversations[0]?.title).toBe('Tile quotes')
    await db.destroy()
  })

  it('writes tags only to the index entry', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await chats.setTags(skey, ['reno'])
    expect((await chats.listConversations()).conversations[0]?.tags).toEqual(['reno'])
    expect((await chats.getInfo(skey))?.tags).toBeUndefined()
    await db.destroy()
  })

  it('skips an info update when the user titled the conversation and unlessUserTitled is set', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await chats.updateInfo(skey, { title: 'Mine', titleSource: 'user' })
    expect(
      await chats.updateInfo(
        skey,
        { title: 'Generated', titleSource: 'generated' },
        { unlessUserTitled: true },
      ),
    ).toBe(false)
    expect((await chats.getInfo(skey))?.title).toBe('Mine')
    await db.destroy()
  })

  it('deletes the space and its index entry', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await chats.deleteConversation(skey)
    expect((await chats.listConversations()).conversations).toEqual([])
    await db.destroy()
  })

  it('returns only index changes since a revision, including deletions', async () => {
    const { chats, db } = await setup()
    const a = await chats.createConversation()
    const { rev } = await chats.listConversations()
    const b = await chats.createConversation()
    await chats.deleteConversation(a.skey)
    const changes = await chats.listConversations(rev)
    expect(changes.conversations.map((c) => c.skey)).toEqual([b.skey])
    expect(changes.deleted).toEqual([a.skey])
    expect(changes.full).toBe(false)
    await db.destroy()
  })

  it('returns a conversation in full, or only its changes since a revision', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await chats.createMessage(skey, '3mmmmmmmmmmm1', userMessage('one'))
    const full = await chats.getConversation(skey)
    expect(full.messages).toHaveLength(1)
    expect(full.info).not.toBeNull()
    await chats.createMessage(skey, '3mmmmmmmmmmm2', userMessage('two'))
    const changes = await chats.getConversation(skey, full.rev)
    expect(changes.messages.map((m) => m.rkey)).toEqual(['3mmmmmmmmmmm2'])
    await db.destroy()
  })

  it('stores preferences in the settings space', async () => {
    const { chats, db } = await setup()
    await chats.putPreferences({ customInstructions: 'Use metric units', generateTitles: false })
    expect(await chats.getPreferences()).toMatchObject({
      customInstructions: 'Use metric units',
      generateTitles: false,
    })
    await db.destroy()
  })

  it('creates the settings space idempotently', async () => {
    const { chats, db } = await setup()
    await chats.ensureSettingsSpace()
    await expect(chats.ensureSettingsSpace()).resolves.toBeUndefined()
    await db.destroy()
  })

  it('reports each write so sync can ignore its own changes', async () => {
    const { chats, writes, db } = await setup()
    const { skey } = await chats.createConversation()
    const cid = await chats.createMessage(skey, '3mmmmmmmmmmmm', userMessage('hi'))
    expect(writes).toContain(cid)
    await db.destroy()
  })

  /** Write a record as another client might, skipping the store's validation. */
  const writeRaw = async (
    db: Db,
    space: string,
    collection: string,
    rkey: string,
    value: Record<string, unknown>,
  ) => {
    const json = JSON.stringify(value)
    const cid = await recordCid(value)
    await sql`insert into local_record values (${space}, ${collection}, ${rkey}, ${json}, ${cid}, 'now')`.execute(
      db,
    )
    await sql`insert into local_op (space_uri, collection, rkey, cid, value_json, created_at) values (${space}, ${collection}, ${rkey}, ${cid}, ${json}, 'now')`.execute(
      db,
    )
  }

  it('leaves out messages that do not match the lexicon, in full and incremental reads', async () => {
    const { chats, db } = await setup()
    const { skey, uri } = await chats.createConversation()
    const before = (await chats.getConversation(skey)).rev
    await chats.createMessage(skey, '3mmmmmmmmmmm1', userMessage('hi'))
    await writeRaw(db, uri, nsid.message, 'bad', { $type: nsid.message, role: 'user' })
    const rkeys = (changes: { messages: { rkey: string }[] }) => changes.messages.map((m) => m.rkey)
    expect(rkeys(await chats.getConversation(skey))).toEqual(['3mmmmmmmmmmm1'])
    expect(rkeys(await chats.getConversation(skey, before))).toEqual(['3mmmmmmmmmmm1'])
    await db.destroy()
  })

  it('fails loudly on an info record that does not match the lexicon', async () => {
    const { chats, db } = await setup()
    const { skey, uri } = await chats.createConversation()
    await sql`delete from local_record where space_uri = ${uri}`.execute(db)
    await writeRaw(db, uri, nsid.info, 'self', { $type: nsid.info, title: 7 })
    await expect(chats.getConversation(skey)).rejects.toBeInstanceOf(InvalidStoredRecord)
    await db.destroy()
  })

  it('leaves invalid index entries out of the chat list', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await writeRaw(db, chats.settingsUri, nsid.conversationRef, 'bad', {
      $type: nsid.conversationRef,
      title: 'no conversation or updatedAt',
    })
    const { conversations } = await chats.listConversations()
    expect(conversations.map((c) => c.skey)).toEqual([skey])
    await db.destroy()
  })

  it('removes the index title when the info record loses its title', async () => {
    const { chats, db } = await setup()
    const { skey } = await chats.createConversation()
    await chats.updateInfo(skey, { title: 'Old' })
    await chats.syncRefTitle(skey, undefined)
    const { conversations } = await chats.listConversations()
    expect(conversations[0]?.title).toBeNull()
    await db.destroy()
  })
})
