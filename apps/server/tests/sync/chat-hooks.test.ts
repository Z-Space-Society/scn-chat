import { nsid } from '@scn-chat/lexicons'
import { describe, expect, it, vi } from 'vitest'
import { fireChatHooks } from '../../src/plugins/chat-hooks.ts'
import type { HookRunner } from '../../src/plugins/hooks.ts'
import { ALICE, collect, spacesHarness } from '../helpers/spaces.ts'

type Harness = Awaited<ReturnType<typeof spacesHarness>>

/** Create a conversation as another client would, straight on the PDS, with its index entry. */
async function createAsClient(h: Harness, skey: string) {
  const uri = await h.external.createSpace(nsid.conversation, skey)
  await h.external.createRecord(uri, nsid.info, 'self', {
    $type: nsid.info,
    createdAt: new Date().toISOString(),
  } as never)
  await h.external.putRecord(h.chats.settingsUri, nsid.conversationRef, skey, {
    $type: nsid.conversationRef,
    conversation: uri,
    updatedAt: new Date().toISOString(),
  } as never)
}

/** Every created and deleted event, in order. */
function changes(h: Harness) {
  const seen: string[] = []
  h.events.on('conversation:created', ({ skey }) => seen.push(`created ${skey}`))
  h.events.on('conversation:deleted', ({ skey }) => seen.push(`deleted ${skey}`))
  return seen
}

describe('conversation created and deleted', () => {
  it('come once each for a conversation the app creates and deletes, even once sync sees them', async () => {
    const h = await spacesHarness()
    await h.engine.syncIndex(ALICE)
    const seen = changes(h)
    const { skey } = await h.chats.createConversation()
    await h.engine.syncIndex(ALICE)
    await h.chats.deleteConversation(skey)
    await h.engine.syncIndex(ALICE)
    await h.engine.conversationDeleted(ALICE, skey)
    expect(seen).toEqual([`created ${skey}`, `deleted ${skey}`])
  })

  it('come once each for a conversation another client creates and deletes', async () => {
    const h = await spacesHarness()
    // An index with a chat in it, so the server's first sync leaves a cursor to sync on from.
    await h.chats.createConversation()
    await h.engine.syncIndex(ALICE)
    const seen = changes(h)
    await createAsClient(h, '3ccccccccccc1')
    await h.engine.syncIndex(ALICE)
    await h.engine.syncIndex(ALICE)
    await h.external.deleteRecord(h.chats.settingsUri, nsid.conversationRef, '3ccccccccccc1')
    await h.engine.syncIndex(ALICE)
    expect(seen).toEqual(['created 3ccccccccccc1', 'deleted 3ccccccccccc1'])
  })

  it('do not come for conversations already there when the server first syncs', async () => {
    const h = await spacesHarness()
    await createAsClient(h, '3ccccccccccc1')
    const created = collect(h.events, 'conversation:created')
    await h.engine.syncIndex(ALICE)
    expect(created).toEqual([])
  })

  it('do not come for another client updating a conversation', async () => {
    const h = await spacesHarness()
    await createAsClient(h, '3ccccccccccc1')
    await h.engine.syncIndex(ALICE)
    const seen = changes(h)
    await h.external.putRecord(h.chats.settingsUri, nsid.conversationRef, '3ccccccccccc1', {
      $type: nsid.conversationRef,
      conversation: h.chats.conversationUri('3ccccccccccc1'),
      updatedAt: new Date().toISOString(),
      title: 'Renamed',
    } as never)
    await h.engine.syncIndex(ALICE)
    expect(seen).toEqual([])
  })

  it('come for a fallback user, whose chats only the app writes', async () => {
    const h = await spacesHarness({ storageMode: 'local' })
    const seen = changes(h)
    const { skey } = await h.chats.createConversation()
    await h.chats.deleteConversation(skey)
    expect(seen).toEqual([`created ${skey}`, `deleted ${skey}`])
  })
})

describe('fireChatHooks', () => {
  it("runs the plugins' hooks with the owner and the conversation's URI", async () => {
    const h = await spacesHarness()
    const action = vi.fn(async () => [])
    fireChatHooks(h.events, () => ({ action }) as unknown as HookRunner, h.logger)
    const { skey, uri } = await h.chats.createConversation()
    await h.chats.deleteConversation(skey)
    expect(action.mock.calls).toEqual([
      ['conversation:created', { user: ALICE, conversation: uri }, h.logger],
      ['conversation:deleted', { user: ALICE, conversation: uri }, h.logger],
    ])
  })
})
