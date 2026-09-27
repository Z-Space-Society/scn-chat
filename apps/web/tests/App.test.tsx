import { render, screen } from '@testing-library/react'
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
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
  })

  it('shows a sign-in prompt on a shared link when signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    window.history.replaceState(null, '', '/s/did:plc:alice/3aaa')
    render(<App />)
    expect(
      await screen.findByText(/Sign in with your atproto account to view this shared chat/),
    ).toBeInTheDocument()
  })

  it('shows a server error when the session check fails with anything but a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    )
    window.history.replaceState(null, '', '/c/abc')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed with 502')
    expect(window.location.pathname).toBe('/c/abc')
  })
})
