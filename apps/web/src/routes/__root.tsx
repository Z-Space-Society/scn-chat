import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Navigate, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { appName } from '../app-name.ts'
import { messageOf } from '../lib/errors.ts'
import { checkSession } from '../session.tsx'
import styles from '../styles.css?url'
import theme from '../theme.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  staleTime: Number.POSITIVE_INFINITY,
  beforeLoad: async ({ context }) => ({ session: await checkSession(context.queryClient) }),
  // The app name comes with each server request, and from the rendered page in the browser.
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
  errorComponent: ({ error }) => <p role="alert">{messageOf(error)}</p>,
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
