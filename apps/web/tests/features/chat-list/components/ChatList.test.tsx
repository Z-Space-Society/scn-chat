import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeContext } from '../../../../src/features/auth/session.ts'
import { ChatList } from '../../../../src/features/chat-list/components/ChatList.tsx'
import { resetSeenCache } from '../../../../src/features/chat-list/lib/seen.ts'
import { StoreProvider } from '../../../../src/store/react.tsx'
import { stubFetch, writes } from '../../../helpers/fetch.ts'
import { renderAt } from '../../../helpers/router.tsx'
import { type HeldMessage, type TestStore, testStore } from '../../../helpers/store.ts'

afterEach(() => vi.unstubAllGlobals())

/** Opens the sidebar's search box with its button, and returns the box. */
async function openSearch() {
  await userEvent.click(screen.getByRole('button', { name: 'Search chats' }))
  return screen.getByRole('searchbox', { name: 'Search chats' })
}

const text = (value: string) => ({
  $type: 'network.sharedcomputer.chat.defs#plainContent',
  parts: [{ $type: 'network.sharedcomputer.chat.defs#textPart', text: value }],
})
const said = (rkey: string, value: string): HeldMessage => ({
  rkey,
  record: { role: 'user', content: text(value), createdAt: '2026-09-26T00:00:00Z' },
})
const answered = (rkey: string, parent: string, status = 'complete'): HeldMessage => ({
  rkey,
  record: {
    role: 'assistant',
    parent,
    status,
    content: text('answer'),
    createdAt: '2026-09-26T00:00:01Z',
  },
})

/**
 * A store with the chats Tiles and Paint, whose message says "blue walls", and two chats this
 * device hasn't downloaded yet.
 */
async function listStore() {
  const store = testStore()
  await store.chats([
    { skey: 'a', title: 'Tiles' },
    { skey: 'b', title: 'Paint' },
    { skey: 'x' },
    { skey: 'y' },
  ])
  store.held('a', { messages: [said('a', 'grout lines')] })
  store.held('b', { messages: [said('b', 'blue walls')] })
  return store
}

async function renderList(store: TestStore, path?: string) {
  return renderAt(
    <StoreProvider store={store.client}>
      <ChatList />
    </StoreProvider>,
    path,
  )
}

/** The search's result for Paint's message, which the hidden list doesn't count as. */
const paintResult = () => screen.findByRole('link', { name: /blue walls/ })

describe('ChatList', () => {
  it('shows skeleton rows until the chat index first syncs, then the chats', async () => {
    await renderList(testStore())
    expect(await screen.findByText('Loading chats')).toBeInTheDocument()
  })

  it('shows no skeleton once the list has its chats', async () => {
    await renderList(await listStore())
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    expect(screen.queryByText('Loading chats')).toBeNull()
  })

  it('reloads the list when the store reports a change to the chat index', async () => {
    const store = await listStore()
    await renderList(store)
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    await act(() => store.chats([{ skey: 'c', title: 'Grout' }]))
    expect(await screen.findByText('Grout')).toBeInTheDocument()
    expect(screen.queryByText('Tiles')).toBeNull()
  })

  it('replaces the list with local search results while a query is active', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetch)
    const store = await listStore()
    const search = vi.spyOn(store.client.calls, 'search')
    await renderList(store)
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    await userEvent.type(await openSearch(), 'blue')
    expect(await paintResult()).toBeInTheDocument()
    // The list stays mounted, hidden, so closing the search brings it back as it was.
    expect(screen.getByText('Tiles')).not.toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Still downloading 2 chats.')
    expect(search).toHaveBeenLastCalledWith('blue')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the settled search in the URL', async () => {
    const { router } = await renderList(await listStore())
    await userEvent.type(await openSearch(), 'blue')
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ q: 'blue' }))
  })

  it('starts from the search in the URL', async () => {
    await renderList(await listStore(), '/?q=blue')
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toHaveValue('blue')
    expect(await paintResult()).toBeInTheDocument()
  })

  it('waits for two characters before searching', async () => {
    const store = await listStore()
    const search = vi.spyOn(store.client.calls, 'search')
    await renderList(store)
    await userEvent.type(await openSearch(), 'b')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(search).not.toHaveBeenCalled()
    expect(screen.getByText('Tiles')).toBeVisible()
  })

  it('shows the list again when the query drops below two characters', async () => {
    await renderList(await listStore())
    const box = await openSearch()
    await userEvent.type(box, 'bl')
    expect(await paintResult()).toBeInTheDocument()
    await userEvent.type(box, '{Backspace}')
    await vi.waitFor(() => expect(screen.getByText('Tiles')).toBeVisible())
  })

  it('searches once typing pauses, not on every character', async () => {
    const store = await listStore()
    const search = vi.spyOn(store.client.calls, 'search')
    await renderList(store)
    await userEvent.type(await openSearch(), 'blue')
    expect(await paintResult()).toBeInTheDocument()
    expect(search.mock.calls).toEqual([['blue']])
  })

  it('shows the list again when the query is cleared', async () => {
    await renderList(await listStore())
    const box = await openSearch()
    await userEvent.type(box, 'blue')
    expect(await paintResult()).toBeInTheDocument()
    await userEvent.clear(box)
    await vi.waitFor(() => expect(screen.getByText('Tiles')).toBeVisible())
  })

  it('opens a new chat without creating one until its first message', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetch)
    const { router } = await renderList(await listStore(), '/chat/s1')
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('signs out and deletes the local copy', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const store = await listStore()
    await renderList(store)
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(store.client.deleteLocalCopy).toHaveBeenCalled())
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toBe('/api/logout')
  })

  it('shows why signing out failed, and keeps the local copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'Forbidden', message: 'Cross-origin' }, { status: 403 }),
      ),
    )
    const store = await listStore()
    await renderList(store)
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cross-origin')
    expect(store.client.deleteLocalCopy).not.toHaveBeenCalled()
  })

  it('shows why deleting the local copy failed after signing out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true })),
    )
    const store = await listStore()
    vi.mocked(store.client.deleteLocalCopy).mockRejectedValue(
      new Error('Another tab is using this device copy.'),
    )
    await renderList(store)
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab')
  })
})

describe('ChatList sidebar', () => {
  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
  const me = {
    did: 'did:plc:alice',
    handle: 'alice.test',
    storageMode: 'space' as const,
    backgroundSync: true,
    roles: ['user'],
    admin: true,
    access: 'full' as const,
    accessMessage: null,
  }

  /**
   * A store with three chats: Tiles, replying now, Paint, with two replies, both updated today, and
   * Taxes, with one reply, from last month. `more` adds chats after them.
   */
  async function sidebarStore(more: { skey: string; title: string; updatedAt: string }[] = []) {
    const store = testStore()
    await store.chats([
      { skey: 'a', title: 'Tiles', tags: ['home'], updatedAt: hoursAgo(0) },
      { skey: 'b', title: 'Paint', tags: ['home', 'diy'], updatedAt: hoursAgo(0) },
      { skey: 'c', title: 'Taxes', updatedAt: daysAgo(40) },
      ...more,
    ])
    store.held('a', { messages: [said('a', 'q'), answered('a.r0', 'a', 'pending')] })
    store.held('b', { messages: [said('b', 'q'), answered('b.r0', 'b'), answered('b.r1', 'b')] })
    store.held('c', { messages: [said('c', 'q'), answered('c.r0', 'c')] })
    store.api.fetchIndex.mockClear()
    return store
  }

  /** Show the list a page of `pageSize` chats at a time, rather than the store's usual 50. */
  function pagedBy(store: TestStore, pageSize: number) {
    const list = store.client.calls.listConversations
    vi.spyOn(store.client.calls, 'listConversations').mockImplementation((options) =>
      list({ ...options, limit: pageSize }),
    )
  }

  async function renderSidebar(storeOrNot?: TestStore) {
    const store = storeOrNot ?? (await sidebarStore())
    await renderAt(
      <MeContext.Provider value={me}>
        <StoreProvider store={store.client}>
          <ChatList />
        </StoreProvider>
      </MeContext.Provider>,
    )
    await screen.findByText('Taxes')
    return store
  }

  afterEach(() => {
    localStorage.clear()
    resetSeenCache()
  })

  it('groups chats under date headings', async () => {
    stubFetch()
    await renderSidebar()
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Tiles')).toBeInTheDocument()
    expect(within(today).getByText('Paint')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Yesterday' })).toBeNull()
    expect(screen.getByText('Taxes').closest('section')).not.toBe(today)
  })

  it('lists each tag with its count, filters by one, and clears the filter', async () => {
    stubFetch()
    await renderSidebar()
    const filter = screen.getByRole('list', { name: 'Filter by tag' })
    expect(within(filter).getByRole('button', { name: 'home, 2 chats' })).toBeInTheDocument()
    await userEvent.click(within(filter).getByRole('button', { name: 'diy, 1 chat' }))
    await vi.waitFor(() => expect(screen.queryByText('Tiles')).toBeNull())
    expect(screen.getByText('Paint')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear the tag filter' }))
    expect(screen.getByText('Tiles')).toBeInTheDocument()
  })

  it('opens the search box from its button, and clears and closes it on Escape', async () => {
    stubFetch()
    await renderSidebar()
    expect(screen.queryByRole('searchbox', { name: 'Search chats' })).toBeNull()
    const box = await openSearch()
    expect(box).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Search chats' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.type(box, 'tile{Escape}')
    expect(screen.queryByRole('searchbox', { name: 'Search chats' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Search chats' })).toHaveFocus()
    expect(await openSearch()).toHaveValue('')
  })

  it('clears the search when its button closes it', async () => {
    stubFetch()
    await renderSidebar()
    await userEvent.type(await openSearch(), 'tile')
    await userEvent.click(screen.getByRole('button', { name: 'Search chats' }))
    expect(screen.queryByRole('searchbox', { name: 'Search chats' })).toBeNull()
    expect(screen.getByText('Taxes')).toBeInTheDocument()
  })

  it('renames and tags a chat from its menu, then syncs the index', async () => {
    const fetch = stubFetch(async () => Response.json({ ok: true }))
    const store = await renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'More for Taxes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const title = screen.getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Tax return{Enter}')
    await vi.waitFor(() => expect(store.api.fetchIndex).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: 'More for Taxes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit tags' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /Tags/ }),
      ' money, money ,2026{Enter}',
    )
    await vi.waitFor(() => expect(writes(fetch)).toHaveLength(2))
    const [rename, tag] = writes(fetch) as [[string, RequestInit], [string, RequestInit]]
    expect(rename[0]).toBe('/api/conversations/c')
    expect(JSON.parse(String(rename[1].body))).toEqual({ title: 'Tax return' })
    expect(JSON.parse(String(tag[1].body))).toEqual({ tags: ['money', '2026'] })
  })

  it("doesn't save an empty title, so the chat can still be titled for it", async () => {
    const fetch = stubFetch(async () => Response.json({ ok: true }))
    await renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'More for Taxes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const title = screen.getByRole('textbox', { name: 'Title' })
    await userEvent.clear(title)
    await userEvent.type(title, '   {Enter}')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(writes(fetch)).toHaveLength(0)
  })

  it('deletes a chat after asking', async () => {
    const fetch = stubFetch(async () => Response.json({ ok: true }))
    const store = await renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'More for Paint' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete “Paint” for good?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete chat' }))
    await vi.waitFor(() => expect(store.api.fetchIndex).toHaveBeenCalled())
    const [deleted] = writes(fetch) as [[string, RequestInit]]
    expect(deleted[0]).toBe('/api/conversations/b')
    expect(deleted[1].method).toBe('DELETE')
  })

  it('marks a chat that is replying, and one with a reply not yet seen here', async () => {
    stubFetch()
    localStorage.setItem('scn-chat:seen:did:plc:alice', JSON.stringify({ b: 'b.r0', c: 'c.r0' }))
    await renderSidebar()
    expect(screen.getByText('Tiles').closest('li')).toHaveAttribute('data-replying')
    expect(screen.getByText('Replying')).toBeInTheDocument()
    expect(screen.getByText('Paint').closest('li')).toHaveAttribute('data-unseen')
    expect(screen.getByText('Taxes').closest('li')).not.toHaveAttribute('data-unseen')
  })

  it('seeds the seen replies from every chat, including those on pages not loaded yet', async () => {
    stubFetch()
    const store = await sidebarStore([{ skey: 'z', title: 'Old', updatedAt: daysAgo(400) }])
    store.held('z', { messages: [said('z', 'q'), answered('z.r4', 'z')] })
    pagedBy(store, 3)
    // The end of the list never comes into view.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    await renderSidebar(store)
    expect(screen.queryByText('Old')).toBeNull()
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('scn-chat:seen:did:plc:alice') ?? '{}')).toEqual({
        b: 'b.r1',
        c: 'c.r0',
        z: 'z.r4',
      }),
    )
  })

  it('loads the next page of chats as the end of the list comes into view', async () => {
    stubFetch()
    const reach: (() => void)[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          reach.push(() => callback([{ isIntersecting: true }]))
        }
        observe() {}
        disconnect() {}
      },
    )
    const store = await sidebarStore()
    pagedBy(store, 2)
    await renderAt(
      <MeContext.Provider value={me}>
        <StoreProvider store={store.client}>
          <ChatList />
        </StoreProvider>
      </MeContext.Provider>,
    )
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText('Taxes')).toBeNull()
    await act(async () => reach.at(-1)?.())
    expect(await screen.findByText('Taxes')).toBeInTheDocument()
  })

  it('treats replies from before this device kept track as seen', async () => {
    stubFetch()
    await renderSidebar()
    expect(screen.getByText('Paint').closest('li')).not.toHaveAttribute('data-unseen')
    expect(JSON.parse(localStorage.getItem('scn-chat:seen:did:plc:alice') ?? '{}')).toEqual({
      b: 'b.r1',
      c: 'c.r0',
    })
  })

  it('shows how current the copy is as a dot on the avatar, and syncs from the menu', async () => {
    stubFetch()
    const store = await renderSidebar()
    const dot = (await screen.findByText('Synced just now')).parentElement
    expect(dot).toHaveAttribute('data-state', 'synced')
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByText('Stored on your PDS')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sync chats' }))
    await vi.waitFor(() => expect(store.api.fetchIndex).toHaveBeenCalled())
  })

  it('opens Settings, Admin, and Sign out from the account, and closes on Escape', async () => {
    stubFetch()
    await renderSidebar()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
  })
})
