import { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen.ts'

export function createQueryClient() {
  return new QueryClient({
    // Failures show at once, and nothing refetches just because the window regained focus.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
}

/**
 * The router, with a query client of its own, so each server request gets a fresh cache. Queries
 * that loaders fill while rendering on the server reach the browser with the page.
 */
export function getRouter({ history }: { history?: RouterHistory } = {}) {
  const queryClient = createQueryClient()
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    scrollRestoration: true,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
