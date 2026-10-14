import { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen.ts'
import { RouteError, RoutePending } from './shared/route-states.tsx'

export function createQueryClient() {
  return new QueryClient({
    // Failures show at once, and nothing refetches just because the window regained focus.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
}

/**
 * What every route shows while loading or after failing, unless it says otherwise. Each route
 * gets its own boundaries, so a failed section shows inside its layout. A route shows its pending
 * skeleton only once loading has taken the theme's quiet wait, 400ms, so a quick load never
 * flashes it, and keeps it long enough to read as a step rather than a flicker.
 */
export const routerDefaults = {
  defaultErrorComponent: RouteError,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 400,
  defaultPendingMinMs: 300,
}

/**
 * The router, with a query client of its own, so each server request gets a fresh cache. Queries
 * that loaders fill while rendering on the server reach the browser with the page.
 */
export function getRouter({ history }: { history?: RouterHistory } = {}) {
  const queryClient = createQueryClient()
  const router = createRouter({
    ...routerDefaults,
    routeTree,
    history,
    context: { queryClient },
    // Pointing at or focusing a link loads its page's code and data, so the click finds them
    // there. The query cache decides when data is stale, rather than the router's own cache.
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // A conversation places its own scroll, at the bottom or on the message in `m`. The router's
    // reset to the top would run after it and undo it, so the router leaves conversations alone.
    scrollRestoration: ({ location }) => !location.pathname.startsWith('/chat/'),
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
