import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatList } from '../../../../src/features/chat-list/components/ChatList.tsx'
import type { StoreClient } from '../../../../src/store/client.ts'
import { StoreProvider } from '../../../../src/store/react.tsx'
import { renderAt } from '../../../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

function fakeStore() {
  return {
    worker: {
      listConversations: vi.fn(async () => [
        { skey: 'a', uri: 'u', title: 'Tiles', tags: [], updatedAt: 't' },
      ]),
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
    store.worker.listConversations.mockResolvedValue([
      { skey: 'c', uri: 'u', title: 'Grout', tags: [], updatedAt: 't' },
    ])
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
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText('Tiles')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Still downloading 2 conversations.')
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
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'blue')
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
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'b')
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
    const box = screen.getByRole('searchbox', { name: 'Search chats' })
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
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'blue')
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
    const box = screen.getByRole('searchbox', { name: 'Search chats' })
    await userEvent.type(box, 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    await userEvent.clear(box)
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab')
  })
})
