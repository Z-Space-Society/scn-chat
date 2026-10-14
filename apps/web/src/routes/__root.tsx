import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Navigate, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { checkSession } from '../features/auth/session.ts'
import logo from '../logo.svg?url'
import { ErrorPage } from '../shared/ErrorPage.tsx'
import { site } from '../shared/site.ts'
import { themeScript } from '../shared/theme.ts'
import { useInstantThemeSwitch } from '../shared/useInstantThemeSwitch.ts'
import { sidebarScript } from '../shared/useSidebar.ts'
import styles from '../styles/app.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  staleTime: Number.POSITIVE_INFINITY,
  beforeLoad: async ({ context }) => ({ session: await checkSession(context.queryClient) }),
  // The site comes with each server request, and from the rendered page in the browser.
  loader: ({ serverContext }) =>
    serverContext
      ? { appName: serverContext.appName, description: serverContext.description }
      : site(),
  head: ({ loaderData, matches }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: pageTitle(matches, loaderData?.appName) },
      { name: 'application-name', content: loaderData?.appName },
      { name: 'description', content: loaderData?.description },
      // Every page but the login page is someone's own, so search engines leave them out.
      { name: 'robots', content: 'noindex' },
      // What a pasted link shows.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: loaderData?.appName },
      { property: 'og:title', content: pageTitle(matches, loaderData?.appName) },
      { property: 'og:description', content: loaderData?.description },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', type: 'image/svg+xml', href: logo },
    ],
    scripts: [
      // Applies the light or dark, and the sidebar's collapse, chosen on this device before the
      // first paint.
      { children: themeScript + sidebarScript },
      // With `pnpm dev --scan`, React Scan outlines components as they render. It hooks into
      // React through the devtools global before React loads, so it runs as a plain script ahead
      // of the app.
      ...(import.meta.env.REACT_SCAN
        ? [{ src: '/node_modules/react-scan/dist/auto.global.js' }]
        : []),
    ],
  }),
  shellComponent: Shell,
  errorComponent: ErrorPage,
  notFoundComponent: () => <Navigate to="/" replace />,
})

/** The deepest page's title, from its route's static data, before the app's name. */
function pageTitle(matches: { staticData: { title?: string } }[], appName = '') {
  const page = matches.findLast((match) => match.staticData.title)?.staticData.title
  return page ? `${page} · ${appName}` : appName
}

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
