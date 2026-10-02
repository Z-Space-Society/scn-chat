import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { endSession, useMe } from '../../session.tsx'
import { openStore } from '../../store/client.ts'
import { StoreProvider } from '../../store/react.tsx'

/** The chat routes, which read the browser's local copy of the chats, so render in the browser. */
export const Route = createFileRoute('/_app/_chats')({ ssr: false, component: Chats })

function Chats() {
  const me = useMe()
  const store = openStore(me.did)
  useEffect(
    () => store.onChange((change) => change.type === 'unauthorized' && endSession(me.did)),
    [store, me.did],
  )
  return (
    <StoreProvider store={store}>
      <Outlet />
    </StoreProvider>
  )
}
