import { lazy, Suspense } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'
import { ChatList } from '../../chat-list/components/ChatList.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { BusyBanner } from '../components/BusyBanner.tsx'
import { ConversationSkeleton } from '../components/ConversationSkeleton.tsx'
import { NewConversation } from '../components/NewConversation.tsx'
import { loadConversationView } from '../lib/load-conversation.ts'

const ConversationView = lazy(async () => ({
  default: (await loadConversationView()).ConversationView,
}))

interface Props {
  skey?: string
}

/** The chats: the chat list beside the open conversation, or a new one. */
export function ChatPage(props: Props) {
  const { error } = useModels()
  return (
    <SidebarLayout kind="chats" nav={<ChatList />}>
      <BusyBanner />
      <ErrorAlert error={error} />
      {props.skey ? (
        <Suspense fallback={<ConversationPending />}>
          <ConversationView key={props.skey} skey={props.skey} />
        </Suspense>
      ) : (
        <NewConversation />
      )}
    </SidebarLayout>
  )
}

/** The conversation's column while its code downloads, as it is while its messages load. */
function ConversationPending() {
  return (
    <section className="mx-auto flex w-full max-w-column flex-1 flex-col px-gutter">
      <ConversationSkeleton />
    </section>
  )
}
