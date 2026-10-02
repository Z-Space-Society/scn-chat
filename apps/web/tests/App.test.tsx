import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRouter } from '../src/router.tsx'

const { openStore, store } = vi.hoisted(() => {
  const store = {
    worker: { listConversations: async () => [] },
    state: () => 'active',
    onState: () => () => {},
    onChange: () => () => {},
    claim: async () => 'active',
    deleteLocalCopy: vi.fn(async () => {}),
  }
  return { store, openStore: vi.fn(() => store) }
})
vi.mock('../src/store/client.ts', () => ({ openStore }))

afterEach(() => {
  vi.unstubAllGlobals()
  openStore.mockClear()
  store.deleteLocalCopy.mockClear()
})

/** A server with a signed-in user, answering every other read with an empty body. */
function signedIn() {
  const me = { did: 'did:plc:alice', handle: 'alice', storageMode: 'local', roles: ['user'] }
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ ...me, backgroundSync: true })
      if (url === '/api/models') return Response.json({ models: [], defaultModel: null })
      if (url === '/api/preferences') return Response.json({ preferences: { timezone } })
      if (url === '/api/account')
        return Response.json({ backgroundSync: true, allowUserOptOut: false })
      return Response.json({})
    }),
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

  it('opens the store on the settings page only when an action needs it', async () => {
    signedIn()
    renderApp('/settings/sync')
    const rebuild = await screen.findByRole('button', { name: "Rebuild this device's copy" })
    expect(openStore).not.toHaveBeenCalled()
    await userEvent.click(rebuild)
    await vi.waitFor(() => expect(store.deleteLocalCopy).toHaveBeenCalled())
    expect(openStore).toHaveBeenCalledWith('did:plc:alice')
  })
})
