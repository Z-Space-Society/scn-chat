import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from '../../../src/features/conversation/chat.ts'
import {
  useFollowedReply,
  useReplyStarted,
} from '../../../src/features/conversation/reply-follower.ts'
import { isPending } from '../../../src/shared/message.ts'
import { StoreProvider } from '../../../src/store/react.tsx'
import { FakeEventSource, lastSource, stubEventSource } from '../../helpers/event-source.ts'
import { stubFetch } from '../../helpers/fetch.ts'
import { messageRecord } from '../../helpers/records.ts'
import { renderAt } from '../../helpers/router.tsx'
import { type HeldMessage, type TestStore, testStore } from '../../helpers/store.ts'

const user: HeldMessage = { rkey: 'u', record: messageRecord({ role: 'user' }) }
const reply = (status: string, rkey = 'u.r0'): HeldMessage => ({
  rkey,
  record: messageRecord({ parent: 'u', status }),
})

let chat: ReturnType<typeof useChat>
const renders = { conversation: 0, header: 0 }

/** The open conversation as the follower sees it: its pending replies, each with a header and its stream. */
function Conversation() {
  renders.conversation++
  chat = useChat('s1')
  return chat.messages
    .filter((message) => isPending(message.record))
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

/** Open chat `s1`, holding `messages` on this device and the PDS. */
async function open(messages: HeldMessage[]) {
  const store = testStore()
  store.held('s1', { messages })
  const view = await renderAt(
    <StoreProvider store={store.client}>
      <Conversation />
    </StoreProvider>,
    '/chat/s1',
  )
  // The conversation has loaded and refreshed, so only the follower can rerender it now.
  await vi.waitFor(() => expect(store.api.fetchKeys).toHaveBeenCalled())
  await act(async () => {})
  return { store, view }
}

/** The PDS now holds the reply as finished, for the next refresh to bring in. */
const finish = (store: TestStore, status = 'complete', rkey = 'u.r0') =>
  store.remote('s1', { messages: [user, reply(status, rkey)] })

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
  it("follows a pending reply's stream, and brings in its record once it finishes", async () => {
    const { store } = await open([user, reply('pending')])
    await vi.waitFor(() => expect(lastSource()).toBeDefined())
    expect(lastSource().url).toBe('/api/conversations/s1/messages/u.r0/stream')
    expect(screen.getByRole('heading')).toHaveTextContent('Waiting')
    streamText('Hello')
    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Started')
    finish(store)
    act(() => lastSource().emit('status', { status: 'complete' }))
    // The refresh the finish sets off brings the final record, which ends the pending reply.
    await vi.waitFor(() => expect(screen.queryByRole('heading')).toBeNull())
    expect(lastSource().closed).toBe(true)
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

  it('follows a reply just sent, before its pending record arrives, until its record is final', async () => {
    stubFetch(async () =>
      Response.json({ rkey: 'v', replyRkey: 'v.r0', status: 'claimed' }, { status: 201 }),
    )
    const { store, view } = await open([user, reply('complete')])
    expect(lastSource()).toBeUndefined()
    await act(() => chat.send({ parent: 'u.r0', parts: [], generation: {} }))
    await vi.waitFor(() =>
      expect(lastSource().url).toBe('/api/conversations/s1/messages/v.r0/stream'),
    )
    const stream = () =>
      view.queryClient.getQueryCache().find({ queryKey: ['reply-stream', 's1', 'v.r0'] })
    expect(stream()).toBeDefined()
    // Its record arrives finished, so what streamed of it goes.
    act(() =>
      store.held('s1', {
        messages: [
          user,
          reply('complete'),
          { rkey: 'v', record: messageRecord({ role: 'user', parent: 'u.r0' }) },
          { rkey: 'v.r0', record: messageRecord({ parent: 'v', status: 'complete' }) },
        ],
      }),
    )
    await vi.waitFor(() => expect(stream()).toBeUndefined())
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
    // The next poll, eight seconds on, finds the reply finished, and polling stops.
    finish(store)
    await act(async () => vi.advanceTimersByTimeAsync(8_100))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('heading')).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(30_000))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(3)
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
