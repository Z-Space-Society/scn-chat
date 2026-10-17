import { act, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BranchMessage } from '../../../src/features/conversation/lib/branch.ts'
import {
  useFollowedReply,
  useReplyFollower,
  useReplyStarted,
} from '../../../src/features/conversation/reply-follower.ts'
import { StoreProvider, useConversation } from '../../../src/store/react.tsx'
import { FakeEventSource, lastSource, stubEventSource } from '../../helpers/event-source.ts'
import { renderAt } from '../../helpers/router.tsx'
import { testStore } from '../../helpers/store.ts'

const user: BranchMessage = { rkey: 'u', record: { role: 'user' } }
const reply = (status: string): BranchMessage => ({
  rkey: 'u.r0',
  record: { role: 'assistant', parent: 'u', status },
})

let follow: (rkey: string) => void
let setMessages: (messages: BranchMessage[]) => void
const renders = { conversation: 0, header: 0 }

interface ConversationProps {
  messages: BranchMessage[]
}

/** The open conversation as the follower sees it: its replies, each with a header and its stream. */
function Conversation(props: ConversationProps) {
  renders.conversation++
  const [messages, set] = useState(props.messages)
  setMessages = set
  // The conversation's own refresh, which a finished reply sets off.
  useConversation('s1')
  follow = useReplyFollower('s1', messages).follow
  return messages
    .filter((message) => message.record.status === 'pending')
    .map((message) => (
      <article key={message.rkey}>
        <Header rkey={message.rkey} />
        <Stream rkey={message.rkey} />
      </article>
    ))
}

interface ReplyProps {
  rkey: string
}

function Header(props: ReplyProps) {
  renders.header++
  return <h2>{useReplyStarted('s1', props.rkey) ? 'Started' : 'Waiting'}</h2>
}

function Stream(props: ReplyProps) {
  const { streamed, notLive } = useFollowedReply('s1', props.rkey)
  return (
    <>
      <p>{streamed?.parts.map((part) => part.text).join('')}</p>
      {notLive && <p>Not live: {notLive}</p>}
    </>
  )
}

async function open(messages: BranchMessage[]) {
  // A store that holds no chats, the conversation's messages coming from the test.
  const store = testStore()
  const view = await renderAt(
    <StoreProvider store={store.client}>
      <Conversation messages={messages} />
    </StoreProvider>,
  )
  // The conversation has loaded and refreshed, so only the follower can rerender it now.
  await vi.waitFor(() => expect(store.api.fetchKeys).toHaveBeenCalled())
  await act(async () => {})
  return { store, view }
}

/** Stream a text part saying `text`, a delta at a time. */
function streamText(text: string) {
  const source = lastSource()
  act(() => {
    source.emit('part-start', { index: 0, partType: 'textPart' })
    for (const letter of text) source.emit('delta', { index: 0, text: letter })
  })
}

beforeEach(() => {
  stubEventSource()
  renders.conversation = 0
  renders.header = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('reply follower', () => {
  it("follows a pending reply's stream, and refreshes the conversation once it finishes", async () => {
    const { store } = await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    expect(lastSource().url).toBe('/api/conversations/s1/messages/u.r0/stream')
    expect(screen.getByRole('heading')).toHaveTextContent('Waiting')
    streamText('Hello')
    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Started')
    store.api.fetchConversation.mockClear()
    act(() => lastSource().emit('status', { status: 'complete' }))
    await vi.waitFor(() => expect(store.api.fetchConversation).toHaveBeenCalled())
    expect(lastSource().closed).toBe(true)
    expect(screen.queryByText(/Not live/)).toBeNull()
  })

  it('rerenders neither the conversation nor the header for the deltas after the reply starts', async () => {
    await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    streamText('H')
    expect(await screen.findByText('Started')).toBeInTheDocument()
    const before = { ...renders }
    act(() => {
      for (const letter of 'ello there') lastSource().emit('delta', { index: 0, text: letter })
    })
    expect(await screen.findByText('Hello there')).toBeInTheDocument()
    expect(renders).toEqual(before)
  })

  it('follows a reply just sent, before its pending record arrives', async () => {
    await open([user])
    expect(lastSource()).toBeUndefined()
    act(() => follow('u.r0'))
    await vi.waitFor(() =>
      expect(lastSource().url).toBe('/api/conversations/s1/messages/u.r0/stream'),
    )
  })

  it('keeps what streamed when the stream drops, and polls with a backoff until the reply finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { store } = await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    streamText('Hel')
    store.api.fetchConversation.mockClear()
    act(() => lastSource().onerror?.())
    expect(await screen.findByText('Not live: dropped')).toBeInTheDocument()
    expect(screen.getByText('Hel')).toBeInTheDocument()
    // Two seconds, then four more.
    await act(async () => vi.advanceTimersByTimeAsync(6_100))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(2)
    act(() => setMessages([user, reply('complete')]))
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(2)
  })

  it('treats an event it cannot read as a dropped stream', async () => {
    await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    act(() => lastSource().emitRaw('delta', 'not json'))
    expect(await screen.findByText('Not live: dropped')).toBeInTheDocument()
    expect(lastSource().closed).toBe(true)
  })

  it('polls, rather than following again, when another server runs the reply', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { store } = await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    store.api.fetchConversation.mockClear()
    await act(async () => lastSource().emit('status', { status: 'unknown' }))
    expect(await screen.findByText('Not live: elsewhere')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(store.api.fetchConversation).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(1_100))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('closes the stream when the conversation closes', async () => {
    const { view } = await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    view.unmount()
    await vi.waitFor(() => expect(lastSource().closed).toBe(true))
  })
})
