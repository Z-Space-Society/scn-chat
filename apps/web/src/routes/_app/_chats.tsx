import sqliteWasm from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'
import { createFileRoute, Outlet, retainSearchParams } from '@tanstack/react-router'
import { profileQuery } from '../../features/auth/queries.ts'
import { attachmentTypesQuery } from '../../features/conversation/attachment-types.ts'
import { ChatPageFrame } from '../../features/conversation/pages/ChatPageFrame.tsx'
import { modelsQuery } from '../../features/models/queries.ts'
import { validateChatListSearch } from '../../shared/search-params.ts'
import { openStore } from '../../store/client.ts'
import { StoreProvider } from '../../store/react.tsx'
import storeWorker from '../../store/worker.ts?worker&url'

/** The chat routes, which read the browser's local copy of the chats, so render in the browser. */
export const Route = createFileRoute('/_app/_chats')({
  ssr: false,
  // The sidebar search stays on every chat route until it's cleared.
  validateSearch: validateChatListSearch,
  search: { middlewares: [retainSearchParams(['q'])] },
  // The store's worker and SQLite are the page's largest downloads, and the worker asks for
  // SQLite only once it runs. The page the server sends names both, so they download alongside
  // the app's code rather than after it, and the worker finds them in the cache.
  head: () => ({
    links: [
      { rel: 'preload', href: storeWorker, as: 'fetch', crossOrigin: 'anonymous' },
      { rel: 'preload', href: sqliteWasm, as: 'fetch', crossOrigin: 'anonymous' },
      // The account card's avatar comes from Bluesky's image CDN, as the server's profile says.
      { rel: 'preconnect', href: 'https://cdn.bsky.app' },
    ],
  }),
  // Opening the store here starts its worker and database downloading alongside the route's code.
  beforeLoad: ({ context }) => ({ store: openStore(context.me.did) }),
  // What the page asks for as it renders starts here instead, alongside its code, without the
  // route waiting for it.
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(modelsQuery)
    void queryClient.prefetchQuery(attachmentTypesQuery)
    void queryClient.prefetchQuery(profileQuery)
  },
  component: Chats,
  // The server sends the page's frame in place of the chats, so a reload never starts blank.
  pendingComponent: ChatPageFrame,
})

function Chats() {
  const { store } = Route.useRouteContext()
  return (
    <StoreProvider store={store}>
      <Outlet />
    </StoreProvider>
  )
}
