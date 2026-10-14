import { createFileRoute, getRouteApi, redirect } from '@tanstack/react-router'
import { ViewerSignOut } from '../features/auth/components/ViewerSignOut.tsx'
import { LoginPage } from '../features/auth/pages/LoginPage.tsx'
import { validateLoginSearch } from '../shared/search-params.ts'

const root = getRouteApi('__root__')

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context }) => {
    // Viewers stay, to see why they can only open shared chats.
    if (context.session.state === 'signed-in' && context.session.me.access === 'full')
      throw redirect({ to: '/' })
  },
  // The one page search engines may list, under the address people reach the app at.
  loader: ({ serverContext }) => ({
    url: `${serverContext?.publicUrl ?? location.origin}/login`,
  }),
  head: ({ loaderData }) => ({
    meta: [
      { name: 'robots', content: 'index, follow' },
      { property: 'og:url', content: loaderData?.url },
    ],
    links: [{ rel: 'canonical', href: loaderData?.url }],
  }),
  component: Login,
})

function Login() {
  const { error, next } = Route.useSearch()
  const { session } = Route.useRouteContext()
  const site = root.useLoaderData()
  if (session.state === 'signed-out')
    return (
      <LoginPage appName={site.appName} description={site.description} error={error} next={next} />
    )
  return (
    <LoginPage
      appName={site.appName}
      description={site.description}
      error={error}
      next={next}
      notice={session.me.accessMessage}
    >
      <ViewerSignOut />
    </LoginPage>
  )
}
