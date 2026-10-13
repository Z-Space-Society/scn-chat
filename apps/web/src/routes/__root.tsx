import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Navigate, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { checkSession } from '../features/auth/session.ts'
import logo from '../logo.svg?url'
import { appName } from '../shared/app-name.ts'
import { ErrorPage } from '../shared/ErrorPage.tsx'
import { themeScript } from '../shared/theme.ts'
import { useInstantThemeSwitch } from '../shared/useInstantThemeSwitch.ts'
import { sidebarScript } from '../shared/useSidebar.ts'
import styles from '../styles/app.css?url'

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
      { rel: 'icon', type: 'image/svg+xml', href: logo },
    ],
    scripts: [
      // Applies the light or dark, and the sidebar's collapse, chosen on this device before the
      // first paint.
      { children: themeScript + sidebarScript },
      // In development, React Scan outlines components as they render. It hooks into React
      // through the devtools global before React loads, so it runs as a plain script ahead of
      // the app.
      ...(import.meta.env.DEV ? [{ src: '/node_modules/react-scan/dist/auto.global.js' }] : []),
    ],
  }),
  shellComponent: Shell,
  errorComponent: ErrorPage,
  notFoundComponent: () => <Navigate to="/" replace />,
})

interface Props {
  children: ReactNode
}

function Shell(props: Props) {
  useInstantThemeSwitch()
  return (
    // The head's script sets data-theme and data-sidebar-collapsed on the root before React
    // hydrates it.
    <html lang="en" suppressHydrationWarning>
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
