import { createFileRoute, Outlet, retainSearchParams } from '@tanstack/react-router'
import { ChatPageFrame } from '../../features/conversation/pages/ChatPageFrame.tsx'
import { validateChatListSearch } from '../../shared/search-params.ts'
import { openStore } from '../../store/client.ts'
import { StoreProvider } from '../../store/react.tsx'

/** The chat routes, which read the browser's local copy of the chats, so render in the browser. */
export const Route = createFileRoute('/_app/_chats')({
  ssr: false,
  // The sidebar search stays on every chat route until it's cleared.
  validateSearch: validateChatListSearch,
  search: { middlewares: [retainSearchParams(['q'])] },
  // Opening the store here starts its worker and database downloading alongside the route's code.
  beforeLoad: ({ context }) => ({ store: openStore(context.me.did) }),
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
