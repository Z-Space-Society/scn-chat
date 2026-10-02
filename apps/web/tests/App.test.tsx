import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('sends signed-out users to the login page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    window.history.replaceState(null, '', '/c/abc')
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })

  it('keeps a signed-out user on a shared link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    window.history.replaceState(null, '', '/s/did:plc:alice/3aaa')
    render(<App />)
    await screen.findByRole('link', { name: 'Sign in' })
    expect(window.location.pathname).toBe('/s/did:plc:alice/3aaa')
  })

  it('shows an error, not the login page, when the session check fails with anything but a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    )
    window.history.replaceState(null, '', '/c/abc')
    render(<App />)
    await screen.findByRole('alert')
    expect(window.location.pathname).toBe('/c/abc')
  })

  it("shows a viewer the server's access message instead of the chat app", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          did: 'did:plc:alice',
          handle: 'alice.test',
          storageMode: 'space',
          backgroundSync: true,
          roles: ['user'],
          admin: false,
          access: 'viewer',
          accessMessage: 'This server is invite-only.',
        }),
      ),
    )
    window.history.replaceState(null, '', '/c/abc')
    render(<App />)
    expect(await screen.findByRole('status')).toHaveTextContent('This server is invite-only.')
  })
})
