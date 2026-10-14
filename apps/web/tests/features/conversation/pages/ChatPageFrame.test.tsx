import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatPageFrame } from '../../../../src/features/conversation/pages/ChatPageFrame.tsx'
import { routerDefaults } from '../../../../src/router.tsx'

/** Show the page's frame at a path, as the server sends it for the chat routes. */
async function frameAt(path: string) {
  const root = createRootRoute({ loader: () => ({ appName: 'SCN Chat' }), component: Outlet })
  const routes = ['/', 'chat/$skey'].map((route) =>
    createRoute({ getParentRoute: () => root, path: route, component: ChatPageFrame }),
  )
  const router = createRouter({
    ...routerDefaults,
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

describe('ChatPageFrame', () => {
  it("offers a new chat's box to type in", async () => {
    await frameAt('/')
    expect(await screen.findByLabelText('Message')).toHaveAttribute('placeholder', 'Ask anything')
    expect(screen.queryByText('Loading messages')).toBeNull()
  })

  it("shows an open chat's messages on their way, over a box that doesn't say Reply yet", async () => {
    await frameAt('/chat/s1')
    expect(await screen.findByLabelText('Message')).toHaveAttribute('placeholder', '')
    expect(screen.getByText('Loading messages')).toBeInTheDocument()
  })
})
