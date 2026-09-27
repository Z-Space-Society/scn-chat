import { nsid } from '@scn-chat/lexicons'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { recordCid } from '../../src/storage/records.ts'
import { ALICE, collect, spacesHarness, userMessage } from '../helpers/spaces.ts'

const stateOf = async (h: Awaited<ReturnType<typeof spacesHarness>>, space: string) =>
  h.db.selectFrom('sync_state').selectAll().where('space_uri', '=', space).executeTakeFirst()

/** A direct client following the index convention: write the message, then bump the entry. */
async function writeAsClient(
  h: Awaited<ReturnType<typeof spacesHarness>>,
  skey: string,
  rkey: string,
  record: object,
) {
  await h.external.createRecord(h.chats.conversationUri(skey), nsid.message, rkey, record as never)
  const ref = await h.external.getRecord(h.chats.settingsUri, nsid.conversationRef, skey)
  await h.external.putRecord(h.chats.settingsUri, nsid.conversationRef, skey, {
    ...(ref?.value ?? { $type: nsid.conversationRef, conversation: h.chats.conversationUri(skey) }),
    updatedAt: new Date().toISOString(),
  })
}

describe('SyncEngine', () => {
  it('turns a direct write noticed through the index into a live message event', async () => {
    const h = await spacesHarness()
    const { skey } = await h.chats.createConversation()
    await h.engine.syncIndex(ALICE)
    const changed = collect(h.events, 'message:changed')
    await writeAsClient(h, skey, '3mmmmmmmmmmm1', userMessage('hi', { generation: {} }))
    await h.engine.syncIndex(ALICE)
    expect(changed).toMatchObject([
      { did: ALICE, skey, rkey: '3mmmmmmmmmmm1', kind: 'create', live: true },
    ])
  })

  it('emits backfill events on the first sync of a conversation', async () => {
    const h = await spacesHarness()
    const { skey } = await h.chats.createConversation()
    await h.external.createRecord(
      h.chats.conversationUri(skey),
      nsid.message,
      '3mmmmmmmmmmm1',
      userMessage('old') as never,
    )
    const changed = collect(h.events, 'message:changed')
    await h.engine.syncConversation(ALICE, skey)
    expect(changed).toMatchObject([{ rkey: '3mmmmmmmmmmm1', live: false }])
  })

  it('tells open tabs when another client deletes a message', async () => {
    const h = await spacesHarness()
    const { skey, uri } = await h.chats.createConversation()
    await h.external.createRecord(uri, nsid.message, '3mmmmmmmmmmm1', userMessage('hi') as never)
    await h.engine.syncConversation(ALICE, skey)
    const changed = collect(h.events, 'conversation:changed')
    await h.external.deleteRecord(uri, nsid.message, '3mmmmmmmmmmm1')
    await h.engine.syncConversation(ALICE, skey)
    expect(changed).toEqual([{ did: ALICE, skey }])
  })

  it('does not copy the title of an info record that fails validation into the index', async () => {
    const h = await spacesHarness()
    const { skey, uri } = await h.chats.createConversation()
    await h.engine.syncConversation(ALICE, skey)
    const value = { $type: nsid.info, title: 'Bad', createdAt: 5 }
    const raw = JSON.stringify(value)
    const cid = await recordCid(value)
    await sql`update local_record set value_json = ${raw}, cid = ${cid} where space_uri = ${uri}`.execute(
      h.db,
    )
    await sql`insert into local_op (space_uri, collection, rkey, cid, value_json, created_at) values (${uri}, ${nsid.info}, 'self', ${cid}, ${raw}, 'now')`.execute(
      h.db,
    )
    await h.engine.syncConversation(ALICE, skey)
    const { conversations } = await h.chats.listConversations()
    expect(conversations[0]?.title).toBeNull()
  })

  it('emits no message events for the server own writes', async () => {
    const h = await spacesHarness()
    const { skey } = await h.chats.createConversation()
    await h.engine.syncConversation(ALICE, skey)
    const changed = collect(h.events, 'message:changed')
    await h.chats.createMessage(skey, '3mmmmmmmmmmm1', userMessage('mine') as never)
    await h.engine.syncConversation(ALICE, skey)
    expect(changed).toEqual([])
  })

  it('syncs only conversations inside the backfill window on a first index sync, and starts at the head', async () => {
    const h = await spacesHarness({ backfillWindowMs: 60 * 60_000 })
    const recent = await h.chats.createConversation()
    const old = await h.chats.createConversation()
    await h.external.putRecord(h.chats.settingsUri, nsid.conversationRef, old.skey, {
      $type: nsid.conversationRef,
      conversation: old.uri,
      updatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    })
    await h.engine.syncIndex(ALICE)
    expect(await stateOf(h, recent.uri)).toBeDefined()
    expect(await stateOf(h, old.uri)).toBeUndefined()
    expect((await stateOf(h, h.chats.settingsUri))?.last_rev).toBe(
      await h.external.headRev(h.chats.settingsUri),
    )
  })

  it('reports a synced message that fails validation instead of treating it as a message', async () => {
    const h = await spacesHarness()
    const { skey, uri } = await h.chats.createConversation()
    await h.engine.syncConversation(ALICE, skey)
    const invalid = collect(h.events, 'message:invalid')
    const changed = collect(h.events, 'message:changed')
    const value = { $type: nsid.message, role: 'user', createdAt: new Date().toISOString() }
    const raw = JSON.stringify(value)
    const cid = await recordCid(value)
    await sql`insert into local_record values (${uri}, ${nsid.message}, 'bad', ${raw}, ${cid}, 'now')`.execute(
      h.db,
    )
    await sql`insert into local_op (space_uri, collection, rkey, cid, value_json, created_at) values (${uri}, ${nsid.message}, 'bad', ${cid}, ${raw}, 'now')`.execute(
      h.db,
    )
    await h.engine.syncConversation(ALICE, skey)
    expect(invalid).toMatchObject([{ rkey: 'bad', error: expect.stringMatching(/content/) }])
    expect(changed).toEqual([])
  })

  it('drops a conversation whose index entry was deleted', async () => {
    const h = await spacesHarness()
    const { skey, uri } = await h.chats.createConversation()
    await h.engine.syncIndex(ALICE)
    const deleted = collect(h.events, 'conversation:deleted')
    await h.external.deleteRecord(h.chats.settingsUri, nsid.conversationRef, skey)
    await h.engine.syncIndex(ALICE)
    expect(deleted).toMatchObject([{ skey }])
    expect(await stateOf(h, uri)).toBeUndefined()
  })

  it('copies an externally changed info title into the index entry', async () => {
    const h = await spacesHarness()
    const { skey, uri } = await h.chats.createConversation()
    await h.engine.syncConversation(ALICE, skey)
    await h.external.putRecord(uri, nsid.info, 'self', {
      $type: nsid.info,
      createdAt: new Date().toISOString(),
      title: 'Renamed elsewhere',
    })
    await h.engine.syncConversation(ALICE, skey)
    expect((await h.chats.listConversations()).conversations[0]?.title).toBe('Renamed elsewhere')
  })

  it('adds a missing index entry for a conversation created by another client, and syncs it', async () => {
    const h = await spacesHarness()
    const uri = await h.external.createSpace(nsid.conversation, '3cccccccccccc')
    await h.external.putRecord(uri, nsid.info, 'self', {
      $type: nsid.info,
      createdAt: new Date().toISOString(),
      title: 'From elsewhere',
    })
    await h.external.createRecord(uri, nsid.message, '3mmmmmmmmmmm1', userMessage('hello') as never)
    const changed = collect(h.events, 'message:changed')
    await h.engine.discover(ALICE)
    expect((await h.chats.listConversations()).conversations).toMatchObject([
      { skey: '3cccccccccccc', title: 'From elsewhere' },
    ])
    expect(changed).toMatchObject([{ rkey: '3mmmmmmmmmmm1', live: false }])
  })

  it('does nothing for a local account', async () => {
    const h = await spacesHarness({ storageMode: 'local' })
    const changed = collect(h.events, 'message:changed')
    await h.engine.syncIndex(ALICE)
    expect(changed).toEqual([])
    expect(await stateOf(h, h.chats.settingsUri)).toBeUndefined()
  })

  it('stores the registration expiry and renews registrations that expire within an hour', async () => {
    const h = await spacesHarness()
    await h.engine.registerIndex(ALICE)
    expect((await stateOf(h, h.chats.settingsUri))?.registered_until).toBeTruthy()
    await h.db
      .updateTable('sync_state')
      .set({ registered_until: new Date(Date.now() + 60_000).toISOString() })
      .execute()
    await h.engine.renewRegistrations()
    const renewed = Date.parse((await stateOf(h, h.chats.settingsUri))?.registered_until ?? '')
    expect(renewed).toBeGreaterThan(Date.now() + 60 * 60_000)
  })
})

describe('SyncEngine gap detection', () => {
  const signedHarness = spacesHarness

  it('keeps the cursor when the signed commit matches the index', async () => {
    const h = await signedHarness()
    await h.chats.createConversation()
    await h.engine.syncIndex(ALICE)
    const before = (await stateOf(h, h.chats.settingsUri))?.last_rev
    await h.engine.safetyNet(ALICE)
    expect((await stateOf(h, h.chats.settingsUri))?.last_rev).toBe(before)
  })

  it('resets the cursor when the signed commit does not match the index', async () => {
    const h = await signedHarness()
    const { skey } = await h.chats.createConversation()
    await h.engine.syncIndex(ALICE)
    await h.db
      .deleteFrom('sync_state')
      .where('space_uri', '=', h.chats.conversationUri(skey))
      .execute()
    h.pds.tamperCommits = true
    await h.engine.safetyNet(ALICE)
    expect(await stateOf(h, h.chats.conversationUri(skey))).toBeDefined()
  })
})
