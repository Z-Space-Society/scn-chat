import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createQueryClient, routerDefaults } from '../../src/router.tsx'

/**
 * Render UI under a memory router at a path such as '/chat/s1?m=r', with a fresh query client,
 * for components that use links, search params, or queries.
 */
export async function renderAt(ui: ReactNode, path = '/') {
  const queryClient = createQueryClient()
  const root = createRootRoute({ component: () => ui })
  // A splat child, so every path matches and the root renders the UI.
  const any = createRoute({ getParentRoute: () => root, path: '$' })
  const router = createRouter({
    ...routerDefaults,
    routeTree: root.addChildren([any]),
    history: createMemoryHistory({ initialEntries: [path] }),
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  await router.load()
  return { ...render(<RouterProvider router={router} />), router, queryClient }
}
