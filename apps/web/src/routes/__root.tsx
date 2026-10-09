import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Navigate, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { checkSession } from '../features/auth/session.ts'
import { appName } from '../shared/app-name.ts'
import { messageOf } from '../shared/errors.ts'
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
    // In development, React Scan outlines components as they render. It hooks into React through
    // the devtools global before React loads, so it runs as a plain script ahead of the app.
    scripts: import.meta.env.DEV ? [{ src: '/node_modules/react-scan/dist/auto.global.js' }] : [],
  }),
  shellComponent: Shell,
  errorComponent: ({ error }) => <p role="alert">{messageOf(error)}</p>,
  notFoundComponent: () => <Navigate to="/" replace />,
})

interface Props {
  children: ReactNode
}

function Shell(props: Props) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
