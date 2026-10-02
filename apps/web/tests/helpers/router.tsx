import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** Render UI that uses links or search params, under a memory router at a path such as '/chat/s1?m=r'. */
export async function renderAt(ui: ReactNode, path = '/') {
  const root = createRootRoute({ component: () => ui })
  // A splat child, so every path matches and the root renders the UI.
  const any = createRoute({ getParentRoute: () => root, path: '$' })
  const router = createRouter({
    routeTree: root.addChildren([any]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  return { ...render(<RouterProvider router={router} />), router }
}
