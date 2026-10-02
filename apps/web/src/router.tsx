import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen.ts'

export function createQueryClient() {
  return new QueryClient({
    // Failures show at once, and nothing refetches just because the window regained focus.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
}

/** The router, with a query client of its own, so each server request gets a fresh cache. */
export function getRouter({ history }: { history?: RouterHistory } = {}) {
  const queryClient = createQueryClient()
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
