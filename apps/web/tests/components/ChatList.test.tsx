import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatList } from '../../src/components/ChatList.tsx'
import type { StoreClient } from '../../src/store/client.ts'
import { StoreProvider } from '../../src/store/react.tsx'

afterEach(() => vi.unstubAllGlobals())

function fakeStore() {
  return {
    worker: { listConversations: vi.fn(async () => []) },
    state: () => 'active',
    onState: () => () => {},
    onChange: () => () => {},
    deleteLocalCopy: vi.fn(async () => {}),
  }
}

describe('ChatList', () => {
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

  it('shows why signing out failed, and keeps the local copy', async () => {
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
    render(
      <StoreProvider store={store as unknown as StoreClient}>
        <ChatList />
      </StoreProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Another tab')
  })
})
