import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRouter } from '../src/router.tsx'
import { stubFetch } from './helpers/fetch.ts'

const { openStore, question, store } = vi.hoisted(() => {
  const question = {
    rkey: 'u',
    author: 'did:plc:alice',
    cid: 'c-u',
    record: {
      role: 'user',
      content: {
        $type: 'network.sharedcomputer.chat.defs#plainContent',
        parts: [{ $type: 'network.sharedcomputer.chat.defs#textPart', text: 'Which tiles?' }],
      },
      createdAt: '2026-09-26T00:00:00Z',
    },
  }
  const store = {
    worker: {
      listConversations: async () => [],
      getConversation: async (skey: string) => ({ skey, info: {}, messages: [question] }),
      refreshConversation: async () => {},
      reconcileConversation: async () => {},
      search: async () => [
        { skey: 's1', title: 'Tiles', rkey: 'u', role: 'user', snippet: 'tiles', time: '' },
      ],
      remainingDownloads: async () => 0,
    },
    state: () => 'active',
    onState: () => () => {},
    onChange: vi.fn((_listener: (change: { type: string }) => void) => () => {}),
    claim: async () => 'active',
    deleteLocalCopy: vi.fn(async () => {}),
  }
  return { store, question, openStore: vi.fn(() => store) }
})
vi.mock('../src/store/client.ts', () => ({ openStore }))

afterEach(() => {
  vi.unstubAllGlobals()
  openStore.mockClear()
  store.deleteLocalCopy.mockClear()
})

/**
 * A server with a signed-in user, answering the reads in `answers` by path and every other read
 * with an empty body.
 */
function signedIn(changes: Record<string, unknown> = {}, answers: Record<string, unknown> = {}) {
  const me = {
    did: 'did:plc:alice',
    handle: 'alice',
    storageMode: 'local',
    roles: ['user'],
    admin: false,
    access: 'full',
    accessMessage: null,
    ...changes,
  }
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  stubFetch(
    async (url: string) => {
      if (url === '/api/me') return Response.json({ ...me, backgroundSync: true })
      if (url === '/api/account')
        return Response.json({ backgroundSync: true, allowUserOptOut: false })
      return Response.json({})
    },
    {
      '/api/preferences': { preferences: { timezone } },
      '/api/admin/users?q=': { users: [], cursor: null },
      '/api/admin/invites': { invites: [] },
      '/api/admin/roles': { roles: [], environmentAdmins: [] },
      ...answers,
    },
  )
}

/** Render the whole app at a path. */
function renderApp(path: string) {
  const router = getRouter({ history: createMemoryHistory({ initialEntries: [path] }) })
  render(<RouterProvider router={router} />)
  return router
}

describe('App', () => {
  it('sends signed-out users to the login page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    const router = renderApp('/chat/abc')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows a sign-in prompt on a shared link when signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    renderApp('/shared/did:plc:alice/3aaa')
    expect(
      await screen.findByText(/Sign in with your atproto account to view this shared chat/),
    ).toBeInTheDocument()
  })

  it('shows a server error when the session check fails with anything but a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    )
    const router = renderApp('/chat/abc')
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed with 502')
    expect(router.state.location.pathname).toBe('/chat/abc')
  })

  it('sends signed-in users from the login page to their chats', async () => {
    signedIn()
    const router = renderApp('/login')
    expect(
      await screen.findByText('Start a new chat, or pick one from the list.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it("sends a viewer to the login page with the server's access message, and signs them out", async () => {
    signedIn({ access: 'viewer', accessMessage: 'This server is invite-only.' })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const router = renderApp('/chat/abc')
    expect(await screen.findByRole('status')).toHaveTextContent('This server is invite-only.')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(openStore).not.toHaveBeenCalled()
  })

  it('sends a viewer from the settings to the login page', async () => {
    signedIn({ access: 'viewer', accessMessage: 'This server is invite-only.' })
    const router = renderApp('/settings')
    expect(await screen.findByRole('status')).toHaveTextContent('This server is invite-only.')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(openStore).not.toHaveBeenCalled()
  })

  it('still opens a shared chat for a viewer', async () => {
    signedIn(
      { access: 'viewer', accessMessage: 'This server is invite-only.' },
      {
        '/api/shared/did:plc:alice/3aaa': {
          owner: { did: 'did:plc:alice', handle: 'alice.test' },
          title: 'Tile quotes',
          messages: [{ rkey: 'u', cid: 'c-u', value: question.record }],
        },
      },
    )
    const router = renderApp('/shared/did:plc:alice/3aaa')
    expect(await screen.findByRole('heading', { name: 'Tile quotes' })).toBeInTheDocument()
    expect(screen.getByText('Shared by alice.test')).toBeInTheDocument()
    expect(screen.getByText('Which tiles?')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/shared/did:plc:alice/3aaa')
    expect(openStore).not.toHaveBeenCalled()
  })

  it("signs the device out when the store's sync finds the session has ended", async () => {
    signedIn()
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    renderApp('/')
    expect(
      await screen.findByText('Start a new chat, or pick one from the list.'),
    ).toBeInTheDocument()
    const listener = store.onChange.mock.calls.at(-1)?.[0]
    listener?.({ type: 'unauthorized' })
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(store.deleteLocalCopy).toHaveBeenCalled()
  })

  it('sends users who are not admins from the admin area to their chats', async () => {
    signedIn()
    const router = renderApp('/admin/roles')
    expect(
      await screen.findByText('Start a new chat, or pick one from the list.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('opens the admin area on its users for an admin', async () => {
    signedIn({ admin: true })
    const router = renderApp('/admin')
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/users')
  })

  it('opens the store on the settings page only when an action needs it', async () => {
    signedIn()
    renderApp('/settings/sync')
    const rebuild = await screen.findByRole('button', { name: "Rebuild this device's copy" })
    expect(openStore).not.toHaveBeenCalled()
    await userEvent.click(rebuild)
    await vi.waitFor(() => expect(store.deleteLocalCopy).toHaveBeenCalled())
    expect(openStore).toHaveBeenCalledWith('did:plc:alice')
  })

  it('keeps a conversation opened from a search result on the matching message', async () => {
    signedIn()
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled(this.id)
    }
    const router = renderApp('/chat/s1?q=tiles')
    expect(await screen.findByText('Which tiles?')).toBeInTheDocument()
    const scrollTo = vi.spyOn(window, 'scrollTo')
    await userEvent.click(await screen.findByRole('link', { name: /Tiles/ }))
    expect(router.state.location.search).toMatchObject({ m: 'u' })
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalledWith('m-u'))
    // The router's reset to the top would otherwise run after it.
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('keeps the sidebar search across chat routes until it is cleared', async () => {
    signedIn()
    Element.prototype.scrollIntoView = () => {}
    const router = renderApp('/?q=tiles')
    await userEvent.click(await screen.findByRole('link', { name: /Tiles/ }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/chat/s1'))
    expect(router.state.location.search).toEqual({ q: 'tiles', m: 'u' })
    const box = screen.getByRole('searchbox', { name: 'Search chats' })
    expect(box).toHaveValue('tiles')
    await userEvent.clear(box)
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ m: 'u' }))
  })
})
