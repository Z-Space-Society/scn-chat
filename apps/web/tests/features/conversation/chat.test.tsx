import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat, useStartChat } from '../../../src/features/conversation/chat.ts'
import { useBranch } from '../../../src/features/conversation/hooks/useBranch.ts'
import type { BranchMessage } from '../../../src/features/conversation/lib/branch.ts'
import { StoreProvider } from '../../../src/store/react.tsx'
import { FakeEventSource, stubEventSource } from '../../helpers/event-source.ts'
import { stubFetch, writes } from '../../helpers/fetch.ts'
import { messageRecord } from '../../helpers/records.ts'
import { renderAt } from '../../helpers/router.tsx'
import { testStore } from '../../helpers/store.ts'

const text = (value: string) => ({
  $type: 'network.sharedcomputer.chat.defs#textPart',
  text: value,
})
const user = (rkey: string, parent?: string): BranchMessage => ({
  rkey,
  record: messageRecord({
    role: 'user',
    content: { parts: [text('q')] },
    ...(parent ? { parent } : {}),
  }),
})
const reply = (rkey: string, parent: string, status = 'complete'): BranchMessage => ({
  rkey,
  record: messageRecord({ parent, status }),
})

let chat: ReturnType<typeof useChat>
const onTurnStarted = vi.fn()

/** The chat, with the focused message and the branch's keys on screen. */
function Chat() {
  chat = useChat('s1', { onTurnStarted })
  return (
    <p>
      {chat.focus ?? 'none'} · {chat.branch.map((step) => step.message.rkey).join(' ')}
    </p>
  )
}

async function open(messages: BranchMessage[], path = '/chat/s1') {
  const store = testStore()
  store.held('s1', { messages })
  const view = await renderAt(
    <StoreProvider store={store.client}>
      <Chat />
    </StoreProvider>,
    path,
  )
  // The local copy has answered and the check from opening has finished.
  await vi.waitFor(() => expect(chat.loaded).toBe(true))
  await vi.waitFor(() => expect(store.api.fetchKeys).toHaveBeenCalled())
  await act(async () => {})
  return { store, ...view }
}

const shown = () => screen.getByRole('paragraph').textContent
const streamsOpened = () => FakeEventSource.instances.map((source) => source.url)

beforeEach(() => {
  stubEventSource()
  onTurnStarted.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('useChat', () => {
  it('sends a message, follows its reply, puts it on the branch, and checks the PDS again', async () => {
    const fetch = stubFetch(async () =>
      Response.json({ rkey: 'u2', replyRkey: 'u2.r0', status: 'claimed' }, { status: 201 }),
    )
    const { store } = await open([user('u'), reply('u.r0', 'u')])
    const message = { parent: 'u.r0', parts: [text('more')], generation: { effort: 'high' } }
    await act(() => chat.send(message))
    const [url, init] = writes(fetch)[0] as [string, RequestInit]
    expect(url).toBe('/api/conversations/s1/messages')
    expect(JSON.parse(String(init.body))).toEqual(message)
    expect(streamsOpened()).toContain('/api/conversations/s1/messages/u2.r0/stream')
    expect(shown()).toMatch(/^u2 · /)
    expect(onTurnStarted).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(store.api.fetchConversation).toHaveBeenCalledTimes(2))
  })

  it('regenerates a reply as a turn too: following it, showing it, and calling back', async () => {
    const fetch = stubFetch(async () =>
      Response.json({ replyRkey: 'u.r1', status: 'claimed' }, { status: 200 }),
    )
    await open([user('u'), reply('u.r0', 'u')])
    act(() => chat.regenerate('u', { provider: 'p', id: 'm' }))
    await vi.waitFor(() => expect(onTurnStarted).toHaveBeenCalledTimes(1))
    const [url, init] = writes(fetch)[0] as [string, RequestInit]
    expect(url).toBe('/api/conversations/s1/messages/u/regenerate')
    expect(JSON.parse(String(init.body))).toEqual({ model: { provider: 'p', id: 'm' } })
    expect(streamsOpened()).toContain('/api/conversations/s1/messages/u.r1/stream')
    expect(shown()).toMatch(/^u\.r1 · /)
  })

  it("says why a stop did nothing, for the conversation's alert", async () => {
    stubFetch(async () => Response.json({ cancelled: false }))
    await open([user('u'), reply('u.r0', 'u', 'pending')])
    expect(chat.running).toBe('u.r0')
    act(() => chat.stop('u.r0'))
    await vi.waitFor(() => expect(chat.outcome.error).toBeInstanceOf(Error))
    expect(String(chat.outcome.error)).toMatch(/may already be finishing/)
  })

  it('has nothing running once the reply at the end of the branch has finished', async () => {
    stubFetch()
    await open([user('u'), reply('u.r0', 'u')])
    expect(chat.running).toBeNull()
  })
})

describe('useStartChat', () => {
  it('creates the chat for its first message, and reuses it when trying again', async () => {
    let sends = 0
    const fetch = stubFetch(async (url) => {
      if (url === '/api/conversations') return Response.json({ skey: 'new' }, { status: 201 })
      sends += 1
      if (sends === 1) return Response.json({ error: 'Busy' }, { status: 503 })
      return Response.json({ rkey: 'u1', replyRkey: 'u1.r0', status: 'claimed' }, { status: 201 })
    })
    let start!: ReturnType<typeof useStartChat>
    function Start() {
      start = useStartChat()
      return null
    }
    await renderAt(<Start />)
    const message = { parts: [text('hi')], generation: {} }
    await expect(start(message)).rejects.toThrow()
    expect(await start(message)).toMatchObject({ skey: 'new', rkey: 'u1', replyRkey: 'u1.r0' })
    expect(writes(fetch).map(([url]) => url)).toEqual([
      '/api/conversations',
      '/api/conversations/new/messages',
      '/api/conversations/new/messages',
    ])
  })
})

describe('useBranch', () => {
  let pick: (rkey: string) => void
  function Branch(props: { messages: BranchMessage[] }) {
    const branch = useBranch(props.messages)
    pick = branch.pick
    return props.messages.map((message) => (
      <p key={message.rkey} id={`m-${message.rkey}`}>
        {message.rkey}
      </p>
    ))
  }
  const messages = [user('u'), reply('u.r0', 'u'), reply('u.r1', 'u')]

  it('scrolls to a message the URL focuses, but not to one picked on the page', async () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    await renderAt(<Branch messages={messages} />, '/chat/s1?m=u.r0')
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1))
    expect(scrolled.mock.contexts[0]).toHaveTextContent('u.r0')
    act(() => pick('u.r1'))
    await act(async () => {})
    expect(scrolled).toHaveBeenCalledTimes(1)
  })
})
