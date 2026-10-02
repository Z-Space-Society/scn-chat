import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../src/routeTree.gen.ts'

afterEach(() => vi.unstubAllGlobals())

/** Render the whole app at a path. */
function renderApp(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
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
})
