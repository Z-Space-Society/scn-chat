import { QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient, routerDefaults } from '../../src/router.tsx'

const sectionQuery = (fetchSection: () => Promise<string>) => ({
  queryKey: ['section'],
  queryFn: fetchSection,
})

function setup(fetchSection: () => Promise<string>) {
  const queryClient = createQueryClient()
  const root = createRootRoute({
    component: () => (
      <>
        <nav>Sidebar</nav>
        <Outlet />
      </>
    ),
  })
  const section = createRoute({
    getParentRoute: () => root,
    path: '/',
    loader: () => queryClient.query(sectionQuery(fetchSection)),
    component: () => <p>{useSuspenseQuery(sectionQuery(fetchSection)).data}</p>,
  })
  const router = createRouter({
    ...routerDefaults,
    routeTree: root.addChildren([section]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
  render(<RouterProvider router={router} />)
}

describe('route defaults', () => {
  it("shows a failed section's error inside its layout, and Retry loads it again", async () => {
    const fetchSection = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Server is down'))
      .mockResolvedValue('Section data')
    setup(fetchSection)
    expect(await screen.findByRole('alert')).toHaveTextContent('Server is down')
    expect(screen.getByText('Sidebar')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Section data')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
