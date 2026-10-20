import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MeContext } from '../../../../src/features/auth/session.ts'
import { BusyBanner } from '../../../../src/features/conversation/components/BusyBanner.tsx'
import { ConversationView } from '../../../../src/features/conversation/components/ConversationView.tsx'
import type * as messageView from '../../../../src/features/conversation/components/MessageView.tsx'
import { resetStepClocks } from '../../../../src/parts/step-clock.ts'
import type { HandoverState } from '../../../../src/store/handover.ts'
import { StoreProvider } from '../../../../src/store/react.tsx'
import { FakeEventSource, lastSource, stubEventSource } from '../../../helpers/event-source.ts'
import { stubFetch, writes } from '../../../helpers/fetch.ts'
import { renderAt } from '../../../helpers/router.tsx'
import { type HeldMessage, type TestStore, testStore } from '../../../helpers/store.ts'

/** How often each message has rendered, by rkey. */
const messageRenders = vi.hoisted(() => new Map<string, number>())
vi.mock(
  '../../../../src/features/conversation/components/MessageView.tsx',
  async (importOriginal) => {
    const actual = await importOriginal<typeof messageView>()
    return {
      ...actual,
      MessageView: (props: messageView.MessageViewProps) => {
        const rkey = props.rkey ?? ''
        messageRenders.set(rkey, (messageRenders.get(rkey) ?? 0) + 1)
        return actual.MessageView(props)
      },
    }
  },
)

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const text = (value: string) => ({
  $type: d('plainContent'),
  parts: [{ $type: d('textPart'), text: value }],
})
const msg = (rkey: string, record: Record<string, unknown>): HeldMessage => ({ rkey, record })
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

/** A store holding chat `s1`, with these messages, on this device and the PDS. */
function storeWith(
  messages: HeldMessage[],
  state: HandoverState = 'active',
  info: Record<string, unknown> = { title: 'Tiles' },
) {
  const store = testStore({ state })
  store.held('s1', { info, messages })
  return store
}

/** Change chat `s1` to hold these messages, as a sync bringing them to this device would. */
const update = (store: TestStore, messages: HeldMessage[]) =>
  store.held('s1', { info: { title: 'Tiles' }, messages })

function renderWith(store: TestStore, children: ReactNode, path = '/chat/s1') {
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
      <StoreProvider store={store.client}>{children}</StoreProvider>
    </MeContext.Provider>,
    path,
  )
}

/** Pick an item from the conversation header's More menu. */
async function fromMenu(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'More' }))
  await userEvent.click(screen.getByRole('button', { name }))
}

beforeEach(() => {
  stubFetch()
  stubEventSource()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ConversationView', () => {
  it('shows skeletons in place of the title and messages, and no placeholder, until the local copy answers', async () => {
    const store = storeWith([user('u', 'question')])
    const read = store.client.calls.getConversation
    let answer = () => {}
    vi.spyOn(store.client.calls, 'getConversation').mockImplementationOnce(
      (skey) => new Promise((resolve) => (answer = () => resolve(read(skey)))),
    )
    // The PDS answers later still, so only the local copy decides what shows.
    store.api.fetchConversation.mockReturnValueOnce(new Promise(() => {}))
    await renderWith(store, <ConversationView skey="s1" />)
    expect(await screen.findByText('Loading messages')).toBeInTheDocument()
    expect(screen.queryByText('New chat')).toBeNull()
    // Until the messages say whether it replies, the box says neither "Reply" nor "Ask anything".
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', '')
    await act(async () => answer())
    expect(await screen.findByText('question')).toBeInTheDocument()
    expect(screen.getByText('Tiles')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', 'Reply')
    expect(document.title).toMatch(/^Tiles · /)
    expect(screen.queryByText('Loading messages')).toBeNull()
  })

  it('opens a linked message on its branch and scrolls to it', async () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled(this.id)
    }
    const store = storeWith([
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
    const store = storeWith([
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
    const store = storeWith([
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
    const messages = [
      user('u', 'question'),
      reply('u.r0', 'first answer', 'u'),
      reply('u.r2', 'third answer', 'u'),
    ]
    const store = storeWith(messages)
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate' }))
    act(() => update(store, [...messages, reply('u.r1', 'regenerated', 'u')]))
    expect(await screen.findByText('regenerated')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it("regenerates and tries again with the reply's own model", async () => {
    const fetch = vi.fn(async () => Response.json({ replyRkey: 'u.r1', status: 'claimed' }))
    stubFetch(fetch)
    const answered = reply('u.r0', 'answer', 'u')
    answered.record.model = { provider: 'p', id: 'smart' }
    const failed = reply('v.r0', 'broken', 'v', 'error')
    failed.record.model = { provider: 'p', id: 'basic' }
    const messages = [user('u', 'question'), answered, user('v', 'again', 'u.r0'), failed]
    await renderWith(storeWith(messages), <ConversationView skey="s1" />)
    const [first] = await screen.findAllByRole('button', { name: 'Regenerate' })
    await userEvent.click(first as HTMLElement)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    const bodies = writes(fetch).map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(bodies).toEqual([
      { model: { provider: 'p', id: 'smart' } },
      { model: { provider: 'p', id: 'basic' } },
    ])
  })

  it('edits a message into a sibling with its own reply', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ rkey: 'u2', replyRkey: 'u2.r0', status: 'claimed' }, { status: 201 }),
    )
    stubFetch(fetch)
    const messages = [user('u', 'original'), reply('u.r0', 'answer', 'u')]
    const store = storeWith(messages)
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit message' }))
    const boxes = screen.getAllByLabelText('Message')
    expect(boxes[0]).toHaveValue('original')
    await userEvent.clear(boxes[0] as HTMLElement)
    await userEvent.type(boxes[0] as HTMLElement, 'edited{Enter}')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    act(() =>
      update(store, [
        ...messages,
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
    const store = storeWith([
      user('u', 'first'),
      reply('u.r0', 'answer', 'u'),
      user('v', 'second', 'u.r0'),
      reply('v.r0', 'another answer', 'v'),
    ])
    await renderWith(store, <ConversationView skey="s1" />)
    await screen.findByText('another answer')
    const [editFirst, editSecond] = screen.getAllByRole('button', { name: 'Edit message' })
    await userEvent.click(editFirst as HTMLElement)
    expect(screen.getByLabelText('Message')).toHaveValue('first')
    await userEvent.click(editSecond as HTMLElement)
    expect(screen.getByLabelText('Message')).toHaveValue('second')
    await userEvent.type(screen.getByLabelText('Message'), '!{Enter}')
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
    const store = storeWith([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(String((writes(fetch)[0] as [string])[0])).toBe(
      '/api/conversations/s1/messages/u.r0/cancel',
    )
  })

  it('shows a pending reply as it streams', async () => {
    const store = storeWith([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
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
    // The work gives way to the reply once it starts.
    for (const thought of screen.getAllByText('pondering')) expect(thought).not.toBeVisible()
  })

  it('scrolls to the bottom on send, even after the reader scrolled up', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ rkey: 'v', replyRkey: null, status: null }, { status: 201 }),
    )
    stubFetch(fetch)
    const store = storeWith([user('u', 'question'), reply('u.r0', 'answer', 'u')])
    await renderWith(
      store,
      <main data-testid="scroller" style={{ overflowY: 'auto' }}>
        <ConversationView skey="s1" />
      </main>,
    )
    await screen.findByText('answer')
    const scroller = screen.getByTestId('scroller')
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 400 })
    scroller.scrollTop = 200
    act(() => void scroller.dispatchEvent(new Event('scroll')))
    await userEvent.type(screen.getByLabelText('Message'), 'more{Enter}')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    // It glides there, to where the last screen of the conversation shows.
    await vi.waitFor(() => expect(scroller.scrollTop).toBe(600))
  })

  it('renders again only the message that changed when a reply finishes', async () => {
    const first = [user('u', 'question'), reply('u.r0', 'answer', 'u')]
    const messages = [...first, user('v', 'again', 'u.r0'), reply('v.r0', '', 'v', 'pending')]
    const store = storeWith(messages)
    await renderWith(store, <ConversationView skey="s1" />)
    await screen.findByText('again')
    await act(async () => {})
    messageRenders.clear()
    act(() => update(store, [...messages.slice(0, 3), reply('v.r0', 'second answer', 'v')]))
    await screen.findByText('second answer')
    expect(messageRenders.get('v.r0')).toBeGreaterThan(0)
    for (const rkey of ['u', 'u.r0', 'v']) expect(messageRenders.get(rkey)).toBeUndefined()
  })

  it('hands a streamed reply over to its record, keeping how long it thought', async () => {
    resetStepClocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const question = user('u', 'question')
    const answer = (status: string, parts: Record<string, unknown>[]) =>
      msg('u.r0', {
        role: 'assistant',
        parent: 'u',
        status,
        content: { $type: d('plainContent'), parts },
        createdAt: '2026-09-26T00:00:01Z',
      })
    const store = storeWith([question, answer('pending', [])])
    await renderWith(store, <ConversationView skey="s1" />)
    await vi.waitFor(() =>
      expect(lastSource()?.url).toBe('/api/conversations/s1/messages/u.r0/stream'),
    )
    act(() => lastSource().emit('part-start', { index: 0, partType: 'reasoningPart' }))
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    act(() => {
      lastSource().emit('part-start', { index: 1, partType: 'textPart' })
      lastSource().emit('delta', { index: 1, text: 'Use porcelain.' })
    })
    // While it streams, each word is a span of its own, which fades in.
    const streamed = (_: string, el: Element | null) =>
      el?.tagName === 'P' && el.textContent === 'Use porcelain.'
    expect(await screen.findByText(streamed)).toBeInTheDocument()
    // The finished record reaches the local copy, and the stream ends.
    act(() =>
      update(store, [
        question,
        answer('complete', [
          { $type: d('reasoningPart'), text: 'Floors take wear.' },
          { $type: d('textPart'), text: 'Use porcelain.' },
        ]),
      ]),
    )
    act(() => lastSource().emit('status', { status: 'complete' }))
    expect(await screen.findByRole('button', { name: /^Thought for 3s/ })).toBeInTheDocument()
    expect(screen.getAllByText('Use porcelain.')).toHaveLength(1)
    expect(lastSource().closed).toBe(true)
  })

  it('syncs and shows a message written from another client', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    stubFetch(fetch)
    const messages = [user('u', 'question'), reply('u.r0', 'answer', 'u')]
    const store = storeWith(messages)
    await renderWith(store, <ConversationView skey="s1" />)
    await screen.findByText('answer')
    await vi.waitFor(() => expect(store.api.fetchKeys).toHaveBeenCalled())
    store.api.fetchConversation.mockClear()
    // Another client writes a message to the PDS, which the refresh brings in.
    store.remote('s1', {
      info: { title: 'Tiles' },
      messages: [...messages, user('v', 'from my phone', 'u.r0', '2026-09-26T00:00:02Z')],
    })
    expect(screen.queryByText('from my phone')).toBeNull()
    await fromMenu('Sync this chat')
    expect(await screen.findByText('from my phone')).toBeInTheDocument()
    expect(String((writes(fetch)[0] as [string])[0])).toBe('/api/conversations/s1/sync')
    expect(store.api.fetchConversation).toHaveBeenCalled()
  })
})

describe('ConversationView fallback model', () => {
  it("shows an earlier reply's model, and sends with it, when the server has no default", async () => {
    const smart = { provider: 'p', id: 'smart', name: 'Smart', source: 'admin', default: false }
    const capabilities = { vision: false, reasoning: false, tools: false }
    stubFetch(undefined, {
      '/api/models': { models: [{ ...smart, capabilities }], defaultModel: null },
    })
    const answered = reply('u.r0', 'answer', 'u')
    answered.record.model = { provider: 'p', id: 'smart' }
    const store = storeWith([user('u', 'question'), answered])
    await renderWith(store, <ConversationView skey="s1" />)
    await vi.waitFor(() => expect(screen.getByLabelText('Model')).toHaveTextContent(/^Smart$/))
    await userEvent.type(screen.getByLabelText('Message'), 'Hello')
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
    const store = storeWith([user('u', 'question'), reply('u.r0', 'answer', 'u')])
    await renderWith(store, <ConversationView skey="s1" />)
    // Regenerate with shows once the models have loaded.
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate with' }))
    await userEvent.click(screen.getByRole('button', { name: 'Claude' }))
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({
      model: { provider: 'router', id: 'anthropic/claude' },
    })
  })
  it('regenerates the reply whose menu was used', async () => {
    const fetch = vi.fn(async () => Response.json({ replyRkey: 'v.r1', status: 'claimed' }))
    const models = [{ provider: 'p', id: 'm', name: 'M', capabilities: caps }]
    stubFetch(fetch, { '/api/models': { models, defaultModel: null } })
    const store = storeWith([
      user('u', 'first'),
      reply('u.r0', 'one', 'u'),
      user('v', 'second', 'u.r0', '2026-09-26T00:00:02Z'),
      reply('v.r0', 'two', 'v'),
    ])
    await renderWith(store, <ConversationView skey="s1" />)
    const [, second] = await screen.findAllByRole('button', { name: 'More actions' })
    await userEvent.click(second as HTMLElement)
    // Regenerate with shows once the models have loaded.
    await userEvent.click(await screen.findByRole('button', { name: 'Regenerate with' }))
    await userEvent.click(screen.getByRole('button', { name: 'M' }))
    expect(String((writes(fetch)[0] as [string])[0])).toBe(
      '/api/conversations/s1/messages/v/regenerate',
    )
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
    const store = storeWith([user('u', 'question')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Tiles' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The title is too long')
  })

  it('closes the rename form once the title is saved', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    stubFetch(fetch)
    const store = storeWith([user('u', 'question')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Tiles' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Title' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Floors')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Tiles' })
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Floors' })
  })

  /** A store whose chat has the given instructions. */
  const instructed = (systemPrompt: string) =>
    storeWith([user('u', 'question')], 'active', { title: 'Tiles', systemPrompt })

  it("edits the chat's instructions from the More menu, starting from the stored ones", async () => {
    const fetch = vi.fn(async () => Response.json({}))
    stubFetch(fetch)
    await renderWith(instructed('Be brief'), <ConversationView skey="s1" />)
    await fromMenu('Instructions')
    const field = screen.getByRole('textbox', { name: 'Instructions for this chat' })
    expect(field).toHaveValue('Be brief')
    expect(field).toHaveFocus()
    await userEvent.clear(field)
    await userEvent.type(field, '  Use metric units ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Instructions' })).toBeNull())
    const [url, init] = writes(fetch)[0] as [string, RequestInit]
    expect(url).toBe('/api/conversations/s1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ systemPrompt: 'Use metric units' })
  })

  it('clears the instructions when saved empty, and keeps the panel open on a failure', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: 'InvalidRecord', message: 'Too long' }, { status: 400 }),
    )
    stubFetch(fetch)
    await renderWith(instructed('Be brief'), <ConversationView skey="s1" />)
    await fromMenu('Instructions')
    await userEvent.clear(screen.getByRole('textbox', { name: 'Instructions for this chat' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too long')
    expect(screen.getByRole('group', { name: 'Instructions' })).toBeInTheDocument()
    const init = (writes(fetch)[0] as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({ systemPrompt: '' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Instructions' })).toBeNull()
  })

  it('only closes the panel when the instructions are saved unchanged', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    stubFetch(fetch)
    await renderWith(instructed('Be brief'), <ConversationView skey="s1" />)
    await fromMenu('Instructions')
    await userEvent.type(screen.getByRole('textbox', { name: 'Instructions for this chat' }), ' ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('group', { name: 'Instructions' })).toBeNull()
    expect(writes(fetch)).toEqual([])
  })

  it("doesn't offer the instructions until the chat's info record has loaded", async () => {
    // A chat this device hasn't downloaded yet, while the PDS is still answering.
    const store = testStore()
    store.api.fetchConversation.mockImplementation(() => new Promise(() => {}))
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: 'Instructions' })).toBeDisabled()
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
    const store = storeWith([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await fromMenu('Sync this chat')
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDS is unreachable')
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('says so when Stop has nothing to stop', async () => {
    stubFetch(vi.fn(async () => Response.json({ cancelled: false })))
    const store = storeWith([user('u', 'q'), reply('u.r0', '', 'u', 'pending')])
    await renderWith(store, <ConversationView skey="s1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('may already be finishing')
  })

  it('shows why the conversation could not be loaded', async () => {
    const store = testStore()
    store.api.fetchConversation.mockRejectedValue(new Error('GET returned 404: Space not found'))
    await renderWith(store, <ConversationView skey="s1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Space not found')
  })
})

describe('BusyBanner', () => {
  it('appears only when the store is busy in another tab, and Use here claims it', async () => {
    const store = testStore({ state: 'busy' })
    await renderWith(store, <BusyBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('busy in another tab')
    await userEvent.click(screen.getByRole('button', { name: 'Use here' }))
    expect(store.client.claim).toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
