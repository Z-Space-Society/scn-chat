import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Navigate,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { appName } from '../app-name.ts'
import { SessionContext, useSessionCheck } from '../session.tsx'
import styles from '../styles.css?url'
import theme from '../theme.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The shell is server-rendered with the app name, which the server passes with each request.
  ssr: true,
  staleTime: Number.POSITIVE_INFINITY,
  loader: ({ serverContext }) => ({ appName: serverContext?.appName ?? appName() }),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: loaderData?.appName },
      { name: 'application-name', content: loaderData?.appName },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'stylesheet', href: theme },
    ],
  }),
  shellComponent: Shell,
  component: Root,
  notFoundComponent: () => <Navigate to="/" replace />,
})

function Shell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function Root() {
  const session = useSessionCheck()
  if (session.state === 'loading') return <p>Loading...</p>
  if (session.state === 'error')
    return <p role="alert">Could not reach the server: {session.message}</p>
  return (
    <SessionContext.Provider value={session}>
      <Outlet />
    </SessionContext.Provider>
  )
}
