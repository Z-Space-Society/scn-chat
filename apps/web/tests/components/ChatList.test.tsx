import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatList } from '../../src/components/ChatList.tsx'
import type { StoreClient } from '../../src/store/client.ts'
import { StoreProvider } from '../../src/store/react.tsx'

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
  it('replaces the list with local search results while a query is active', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetch)
    const store = fakeStore()
    render(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    expect(await screen.findByText('Tiles')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(screen.queryByText('Tiles')).toBeNull()
    expect(store.worker.search).toHaveBeenLastCalledWith('blue')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('waits for two characters before searching', async () => {
    const store = fakeStore()
    render(
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
    render(
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
    render(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'blue')
    expect(await screen.findByText('Paint')).toBeInTheDocument()
    expect(store.worker.search.mock.calls).toEqual([['blue']])
  })

  it('signs out and deletes the local copy', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const store = fakeStore()
    render(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(store.deleteLocalCopy).toHaveBeenCalled())
    expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toBe('/api/logout')
  })

  it('keeps the local copy when signing out fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'Forbidden', message: 'Cross-origin' }, { status: 403 }),
      ),
    )
    const store = fakeStore()
    render(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('alert')
    expect(store.deleteLocalCopy).not.toHaveBeenCalled()
  })
})
