import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeContext } from '../../../../src/features/auth/session.ts'
import { ChatList } from '../../../../src/features/chat-list/components/ChatList.tsx'
import { resetSeenCache } from '../../../../src/features/chat-list/lib/seen.ts'
import type { StoreClient } from '../../../../src/store/client.ts'
import { StoreProvider } from '../../../../src/store/react.tsx'
import { stubFetch, writes } from '../../../helpers/fetch.ts'
import { renderAt } from '../../../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

/** Opens the sidebar's search box with its button, and returns the box. */
async function openSearch() {
  await userEvent.click(screen.getByRole('button', { name: 'Search chats' }))
  return screen.getByRole('searchbox', { name: 'Search chats' })
}

type Chat = { skey: string; tags: string[]; latestReply?: string | null }

/**
 * The store's list, tags, and newest replies over `chats`, read each time they're asked for, as
 * one page, or one page of a tag.
 */
function listing(chats: () => Chat[]) {
  return {
    listConversations: vi.fn(
      async (options?: {
        tag?: string | null
        after?: unknown
      }): Promise<{
        chats: Chat[]
        next: { updatedAt: string; skey: string } | null
      }> => ({
        chats: chats().filter((chat) => !options?.tag || chat.tags.includes(options.tag)),
        next: null,
      }),
    ),
    listTags: vi.fn(async () => {
      const counts = new Map<string, number>()
      for (const tag of chats().flatMap((chat) => chat.tags))
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      return [...counts].map(([tag, count]) => ({ tag, count }))
    }),
    latestReplies: vi.fn(async () =>
      chats().map((chat) => ({ skey: chat.skey, latestReply: chat.latestReply ?? null })),
    ),
  }
}

function fakeStore(
  chats: Chat[] = [{ skey: 'a', uri: 'u', title: 'Tiles', tags: [], updatedAt: 't' } as Chat],
) {
  let current = chats
  return {
    setChats: (next: Chat[]) => {
      current = next
    },
    worker: {
      ...listing(() => current),
      search: vi.fn(async () => [
        { skey: 'b', title: 'Paint', rkey: 'm1', role: 'user', snippet: 'blue', time: 't' },
      ]),
      remainingDownloads: vi.fn(async () => 2),
    },
    state: () => 'active',
    onState: () => () => {},
    onChange: () => () => {},
    deleteLocalCopy: vi.fn(async () => {}),
  }
}

describe('ChatList', () => {
  it('shows skeleton rows until the chat index first syncs, then the chats', async () => {
    const store = fakeStore()
    const status = { syncedAt: null as string | null, remaining: 0 }
    store.setChats([])
    Object.assign(store.worker, { syncStatus: vi.fn(async () => status) })
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    expect(await screen.findByText('Loading chats')).toBeInTheDocument()
  })

  it('shows no skeleton once the list has its chats', async () => {
    await renderAt(
      <StoreProvider store={fakeStore() as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    expect(screen.queryByText('Loading chats')).toBeNull()
  })

  it('reloads the list when the store reports a change to the chat index', async () => {
    const listeners = new Set<(change: { type: string }) => void>()
    const store = {
      ...fakeStore(),
      onChange: (listener: (change: { type: string }) => void) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    }
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    store.setChats([{ skey: 'c', uri: 'u', title: 'Grout', tags: [], updatedAt: 't' } as Chat])
    for (const listener of listeners) listener({ type: 'index' })
    expect(await screen.findByText('Grout')).toBeInTheDocument()
  })

  it('replaces the list with local search results while a query is active', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetch)
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    await userEvent.type(await openSearch(), 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText('Tiles')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Still downloading 2 chats.')
    expect(store.worker.search).toHaveBeenLastCalledWith('blue')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the settled search in the URL', async () => {
    const store = fakeStore()
    const { router } = await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.type(await openSearch(), 'blue')
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ q: 'blue' }))
  })

  it('starts from the search in the URL', async () => {
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
      '/?q=blue',
    )
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toHaveValue('blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
  })

  it('waits for two characters before searching', async () => {
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.type(await openSearch(), 'b')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(store.worker.search).not.toHaveBeenCalled()
    expect(screen.getByText('Tiles')).toBeInTheDocument()
  })

  it('shows the list again when the query drops below two characters', async () => {
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    const box = await openSearch()
    await userEvent.type(box, 'bl')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    await userEvent.type(box, '{Backspace}')
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
  })

  it('searches once typing pauses, not on every character', async () => {
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.type(await openSearch(), 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(store.worker.search.mock.calls).toEqual([['blue']])
  })

  it('shows the list again when the query is cleared', async () => {
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    const box = await openSearch()
    await userEvent.type(box, 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    await userEvent.clear(box)
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
  })

  it('opens a new chat without creating one until its first message', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetch)
    const store = fakeStore()
    const { router } = await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
      '/chat/s1',
    )
    await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('signs out and deletes the local copy', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(store.deleteLocalCopy).toHaveBeenCalled())
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toBe('/api/logout')
  })

  it('shows why signing out failed, and keeps the local copy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'Forbidden', message: 'Cross-origin' }, { status: 403 }),
      ),
    )
    const store = fakeStore()
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cross-origin')
    expect(store.deleteLocalCopy).not.toHaveBeenCalled()
  })

  it('shows why deleting the local copy failed after signing out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true })),
    )
    const store = fakeStore()
    store.deleteLocalCopy.mockRejectedValue(new Error('Another tab is using this device copy.'))
    await renderAt(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab')
  })
})

describe('ChatList sidebar', () => {
  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
  const chats = [
    {
      skey: 'a',
      uri: 'u',
      title: 'Tiles',
      tags: ['home'],
      updatedAt: hoursAgo(0),
      pending: true,
      latestReply: null,
    },
    {
      skey: 'b',
      uri: 'u',
      title: 'Paint',
      tags: ['home', 'diy'],
      updatedAt: hoursAgo(0),
      pending: false,
      latestReply: 'b.r1',
    },
    {
      skey: 'c',
      uri: 'u',
      title: 'Taxes',
      tags: [],
      updatedAt: daysAgo(40),
      pending: false,
      latestReply: 'c.r0',
    },
  ]
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

  function sidebarStore() {
    const store = fakeStore(chats)
    return {
      ...store,
      worker: {
        ...store.worker,
        syncIndex: vi.fn(async () => {}),
        syncStatus: vi.fn(async () => ({ syncedAt: new Date().toISOString(), remaining: 0 })),
      },
    }
  }

  async function renderSidebar(store = sidebarStore()) {
    await renderAt(
      <MeContext.Provider value={me}>
        <StoreProvider store={store as unknown as StoreClient}>
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
    const store = await renderSidebar()
    const filter = screen.getByRole('list', { name: 'Filter by tag' })
    expect(within(filter).getByRole('button', { name: 'home, 2 chats' })).toBeInTheDocument()
    await userEvent.click(within(filter).getByRole('button', { name: 'diy, 1 chat' }))
    // The store pages through only the tag's chats.
    expect(store.worker.listConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: 'diy' }),
    )
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
    await vi.waitFor(() => expect(store.worker.syncIndex).toHaveBeenCalled())
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

  it('deletes a chat after asking', async () => {
    const fetch = stubFetch(async () => Response.json({ ok: true }))
    const store = await renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'More for Paint' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete “Paint” for good?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete chat' }))
    await vi.waitFor(() => expect(store.worker.syncIndex).toHaveBeenCalled())
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
    const store = sidebarStore()
    store.worker.latestReplies.mockResolvedValue([
      { skey: 'b', latestReply: 'b.r1' },
      { skey: 'z', latestReply: 'z.r4' },
    ])
    await renderSidebar(store)
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('scn-chat:seen:did:plc:alice') ?? '{}')).toEqual({
        b: 'b.r1',
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
    const store = sidebarStore()
    const [first, second, third] = chats
    store.worker.listConversations.mockImplementation(async (options?: { after?: unknown }) =>
      options?.after
        ? { chats: [third as Chat], next: null }
        : { chats: [first, second] as Chat[], next: { updatedAt: 't', skey: 'b' } },
    )
    await renderAt(
      <MeContext.Provider value={me}>
        <StoreProvider store={store as unknown as StoreClient}>
          <ChatList />
        </StoreProvider>
      </MeContext.Provider>,
    )
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText('Taxes')).toBeNull()
    await act(async () => reach.at(-1)?.())
    expect(await screen.findByText('Taxes')).toBeInTheDocument()
    expect(store.worker.listConversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ after: { updatedAt: 't', skey: 'b' } }),
    )
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
    await vi.waitFor(() => expect(store.worker.syncIndex).toHaveBeenCalled())
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
