import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusyBanner } from '../../src/components/BusyBanner.tsx'
import { ConversationView } from '../../src/components/ConversationView.tsx'
import { MeContext } from '../../src/session.tsx'
import type { StoreClient } from '../../src/store/client.ts'
import type { HandoverState } from '../../src/store/handover.ts'
import { StoreProvider } from '../../src/store/react.tsx'
import { stubFetch, writes } from '../helpers/fetch.ts'
import { renderAt } from '../helpers/router.tsx'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const text = (value: string) => ({
  $type: d('plainContent'),
  parts: [{ $type: d('textPart'), text: value }],
})
const msg = (rkey: string, record: Record<string, unknown>) => ({
  rkey,
  author: 'did:plc:alice',
  cid: `c-${rkey}`,
  record,
})
const user = (rkey: string, value: string, parent?: string, at = '2026-09-26T00:00:00Z') =>
  msg(rkey, { role: 'user', content: text(value), createdAt: at, ...(parent ? { parent } : {}) })
const reply = (rkey: string, value: string, parent: string, status = 'complete') =>
  msg(rkey, {
    role: 'assistant',
    content: text(value),
    parent,
    status,
    createdAt: '2026-09-26T00:00:01Z',
  })

class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, ((event: { data: string }) => void)[]>()
  onerror: (() => void) | null = null
  closed = false
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, data: object) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) })
  }
  close() {
    this.closed = true
  }
}

function fakeStore(messages: ReturnType<typeof msg>[], state: HandoverState = 'active') {
  const data = { messages }
  const changes = new Set<(change: { type: string; skey?: string }) => void>()
  const states = new Set<(s: HandoverState) => void>()
  let current = state
  const store = {
    data,
    worker: {
      getConversation: vi.fn(async (skey: string) => ({
        skey,
        info: { title: 'Tiles' },
        messages: data.messages,
      })),
      refreshConversation: vi.fn(async () => {}),
      reconcileConversation: vi.fn(async () => {}),
      listConversations: vi.fn(async () => []),
    },
    state: () => current,
    onState: (listener: (s: HandoverState) => void) => {
      states.add(listener)
      return () => states.delete(listener)
    },
    onChange: (listener: (change: { type: string; skey?: string }) => void) => {
      changes.add(listener)
      return () => changes.delete(listener)
    },
    claim: vi.fn(async () => {
      current = 'active'
      for (const listener of states) listener(current)
      return current
    }),
    deleteLocalCopy: vi.fn(async () => {}),
    update(next: ReturnType<typeof msg>[]) {
      data.messages = next
      for (const listener of changes) listener({ type: 'conversation', skey: 's1' })
    },
  }
  return store
}

function renderWith(store: ReturnType<typeof fakeStore>, children: ReactNode, path = '/chat/s1') {
  return renderAt(
    <MeContext.Provider
      value={{
        did: 'did:plc:alice',
        handle: 'alice',
        storageMode: 'local',
        backgroundSync: true,
        roles: ['user'],
        admin: false,
        access: 'full',
        accessMessage: null,
      }}
    >
      <StoreProvider store={store as unknown as StoreClient}>{children}</StoreProvider>
    </MeContext.Provider>,
    path,
  )
}

beforeEach(() => {
  stubFetch()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => vi.unstubAllGlobals())

describe('ConversationView', () => {
  it('opens a linked message on its branch and scrolls to it', async () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled(this.id)
    }
    const store = fakeStore([
      user('u', 'question'),
      reply('u.r0', 'first answer', 'u'),
      reply('u.r1', 'second answer', 'u'),
    ])
    await renderWith(store, <ConversationView skey="s1" />, '/chat/s1?m=u.r0')
    expect(await screen.findByText('first answer')).toBeInTheDocument()
    expect(screen.queryByText('second answer')).toBeNull()
    expect(scrolled).toHaveBeenCalledWith('m-u.r0')
  })

  it('shows the newest branch and switches branches with the sibling controls', async () => {
    const store = fakeStore([
      user('u', 'question'),
      reply('u.r0', 'first answer', 'u'),
      reply('u.r1', 'second answer', 'u'),
    ])
    await renderWith(store, <ConversationView skey="s1" />)
    expect(await screen.findByText('second answer')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous version' }))
    expect(screen.getByText('first answer')).toBeInTheDocument()
    expect(screen.queryByText('second answer')).toBeNull()
  })

  it('names the chosen branch in the URL without scrolling', async () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled(this.id)
    }
    const store = fakeStore([
      user('u', 'question'),
      reply('u.r0', 'first answer', 'u'),
      reply('u.r1', 'second answer', 'u'),
    ])
    const { router } = await renderWith(store, <ConversationView skey="s1" />)
    expect(await screen.findByText('second answer')).toBeInTheDocument()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    await userEvent.click(screen.getByRole('button', { name: 'Previous version' }))
    expect(router.state.location.search).toEqual({ m: 'u.r0' })
    expect(scrolled).not.toHaveBeenCalled()
    // Nor does the router reset the page to the top.
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('regenerates and selects the new reply, even when it is not the newest sibling', async () => {
    stubFetch(vi.fn(async () => Response.json({ replyRkey: 'u.r1', status: 'claimed' })))
    const store = fakeStore([
      user('u', 'question'),
      reply('u.r0', 'first answer', 'u'),
      reply('u.r2', 'third answer', 'u'),
    ])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    act(() => store.update([...store.data.messages, reply('u.r1', 'regenerated', 'u')]))
    expect(await screen.findByText('regenerated')).toBeInTheDocument()
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
  })

  it('edits a message into a sibling with its own reply', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ rkey: 'u2', replyRkey: 'u2.r0', status: 'claimed' }, { status: 201 }),
    )
    stubFetch(fetch)
    const store = fakeStore([user('u', 'original'), reply('u.r0', 'answer', 'u')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const boxes = screen.getAllByPlaceholderText('Message')
    expect(boxes[0]).toHaveValue('original')
    await userEvent.clear(boxes[0] as HTMLElement)
    await userEvent.type(boxes[0] as HTMLElement, 'edited{Enter}')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    act(() =>
      store.update([
        ...store.data.messages,
        user('u2', 'edited', undefined, '2026-09-26T00:05:00Z'),
        reply('u2.r0', 'new answer', 'u2'),
      ]),
    )
    expect(await screen.findByText('new answer')).toBeInTheDocument()
  })

  it('starts the edit over when Edit is clicked on another message', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ rkey: 'v2', replyRkey: 'v2.r0', status: 'claimed' }, { status: 201 }),
    )
    stubFetch(fetch)
    const store = fakeStore([
      user('u', 'first'),
      reply('u.r0', 'answer', 'u'),
      user('v', 'second', 'u.r0'),
      reply('v.r0', 'another answer', 'v'),
    ])
    await renderWith(store, <ConversationView skey="s1" />)
    await screen.findByText('another answer')
    const [editFirst, editSecond] = screen.getAllByRole('button', { name: 'Edit' })
    await userEvent.click(editFirst as HTMLElement)
    expect(screen.getByPlaceholderText('Message')).toHaveValue('first')
    await userEvent.click(editSecond as HTMLElement)
    expect(screen.getByPlaceholderText('Message')).toHaveValue('second')
    await userEvent.type(screen.getByPlaceholderText('Message'), '!{Enter}')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toMatchObject({
      parent: 'u.r0',
      parts: [{ text: 'second!' }],
    })
  })

  it('stops a generating reply', async () => {
    const fetch = vi.fn(async () => Response.json({ cancelled: true }))
    stubFetch(fetch)
    const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(String((writes(fetch)[0] as [string])[0])).toBe(
      '/api/conversations/s1/messages/u.r0/cancel',
    )
  })

  it('shows streamed text for a pending reply and refreshes when the stream ends', async () => {
    const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    const source = FakeEventSource.instances[0] as FakeEventSource
    expect(source.url).toBe('/api/conversations/s1/messages/u.r0/stream')
    act(() => {
      source.emit('part-start', { index: 0, partType: 'reasoningPart' })
      source.emit('delta', { index: 0, text: 'pondering' })
      source.emit('part-start', { index: 1, partType: 'textPart' })
      source.emit('delta', { index: 1, text: 'Hel' })
      source.emit('delta', { index: 1, text: 'lo' })
    })
    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('pondering').closest('details')).not.toBeNull()
    act(() => source.emit('status', { status: 'complete' }))
    await vi.waitFor(() => expect(source.closed).toBe(true))
    await vi.waitFor(() => expect(store.worker.refreshConversation).toHaveBeenCalled())
  })

  it('keeps refreshing until the reply finishes when the stream drops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
      await renderWith(store, <ConversationView skey="s1" />)
      await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
      store.worker.refreshConversation.mockClear()
      act(() => (FakeEventSource.instances[0] as FakeEventSource).onerror?.())
      await act(async () => vi.advanceTimersByTimeAsync(6_100))
      expect(store.worker.refreshConversation.mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ConversationView fallback model', () => {
  it("lets the composer fall back to an earlier reply's model when the server has no default", async () => {
    stubFetch(undefined, { '/api/models': { models: [], defaultModel: null } })
    const answered = reply('u.r0', 'answer', 'u')
    answered.record.model = { provider: 'p', id: 'smart' }
    const store = fakeStore([user('u', 'question'), answered])
    await renderWith(store, <ConversationView skey="s1" />)
    expect(await screen.findByRole('option', { name: 'Default model' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })
})

describe('ConversationView errors', () => {
  const caps = { vision: false, reasoning: false, tools: false }

  it('regenerates with a model whose ID contains a slash', async () => {
    const fetch = vi.fn(async () => Response.json({ replyRkey: 'u.r1', status: 'claimed' }))
    const models = [
      { provider: 'router', id: 'anthropic/claude', name: 'Claude', capabilities: caps },
    ]
    stubFetch(fetch, { '/api/models': { models, defaultModel: null } })
    const store = fakeStore([user('u', 'question'), reply('u.r0', 'answer', 'u')])
    await renderWith(store, <ConversationView skey="s1" />)
    await screen.findAllByRole('option', { name: 'Claude' })
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Regenerate with' }),
      'router/anthropic/claude',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({
      model: { provider: 'router', id: 'anthropic/claude' },
    })
  })

  it("keeps each reply's regenerate model to that reply", async () => {
    const fetch = vi.fn(async () => Response.json({ replyRkey: 'v.r1', status: 'claimed' }))
    const models = [{ provider: 'p', id: 'm', name: 'M', capabilities: caps }]
    stubFetch(fetch, { '/api/models': { models, defaultModel: null } })
    const store = fakeStore([
      user('u', 'first'),
      reply('u.r0', 'one', 'u'),
      user('v', 'second', 'u.r0', '2026-09-26T00:00:02Z'),
      reply('v.r0', 'two', 'v'),
    ])
    await renderWith(store, <ConversationView skey="s1" />)
    await screen.findAllByRole('option', { name: 'M' })
    const [first, second] = screen.getAllByRole('combobox', { name: 'Regenerate with' })
    await userEvent.selectOptions(first as HTMLElement, 'p/m')
    expect(second).toHaveValue('')
    await userEvent.click(screen.getAllByRole('button', { name: 'Regenerate' })[1] as HTMLElement)
    const [url, init] = writes(fetch)[0] as [string, RequestInit]
    expect(String(url)).toBe('/api/conversations/s1/messages/v/regenerate')
    expect(JSON.parse(String(init.body))).toEqual({})
  })

  it('shows why a rename failed', async () => {
    stubFetch(
      vi.fn(async () =>
        Response.json(
          { error: 'InvalidRecord', message: 'The title is too long' },
          { status: 400 },
        ),
      ),
    )
    const store = fakeStore([user('u', 'question')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Rename' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The title is too long')
  })

  it('closes the rename form once the title is saved', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    stubFetch(fetch)
    const store = fakeStore([user('u', 'question')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Rename' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Title' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Floors')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Rename' })
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Floors' })
  })

  it("shows a failed sync in the conversation's one alert, until a later stop succeeds", async () => {
    stubFetch(
      vi.fn(async (url: string) =>
        url.endsWith('/sync')
          ? Response.json(
              { error: 'UpstreamFailure', message: 'The PDS is unreachable' },
              { status: 502 },
            )
          : Response.json({ cancelled: true }),
      ),
    )
    const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sync' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDS is unreachable')
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('says so when Stop has nothing to stop', async () => {
    stubFetch(vi.fn(async () => Response.json({ cancelled: false })))
    const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be stopped')
  })

  it('shows why the conversation could not be loaded', async () => {
    const store = fakeStore([])
    store.worker.refreshConversation.mockRejectedValue(
      new Error('GET returned 404: Space not found'),
    )
    await renderWith(store, <ConversationView skey="s1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Space not found')
  })

  it('stops polling once the reply finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
      await renderWith(store, <ConversationView skey="s1" />)
      await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
      act(() => (FakeEventSource.instances[0] as FakeEventSource).onerror?.())
      await act(async () => store.update([user('u', 'q'), reply('u.r0', 'done', 'u')]))
      await act(async () => vi.advanceTimersByTimeAsync(2_100))
      const calls = store.worker.refreshConversation.mock.calls.length
      await act(async () => vi.advanceTimersByTimeAsync(6_000))
      expect(store.worker.refreshConversation.mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ConversationView streams', () => {
  it('waits and polls, instead of re-following, when this server is not running the reply', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const store = fakeStore([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
      await renderWith(store, <ConversationView skey="s1" />)
      await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
      await act(async () =>
        (FakeEventSource.instances[0] as FakeEventSource).emit('status', { status: 'unknown' }),
      )
      await act(async () => vi.advanceTimersByTimeAsync(1_000))
      expect(FakeEventSource.instances).toHaveLength(1)
      const before = store.worker.refreshConversation.mock.calls.length
      await act(async () => vi.advanceTimersByTimeAsync(2_100))
      expect(store.worker.refreshConversation.mock.calls.length).toBe(before + 1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('BusyBanner', () => {
  it('appears only when the store is busy in another tab, and Use here claims it', async () => {
    const store = fakeStore([], 'busy')
    await renderWith(store, <BusyBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('busy in another tab')
    await userEvent.click(screen.getByRole('button', { name: 'Use here' }))
    expect(store.claim).toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
