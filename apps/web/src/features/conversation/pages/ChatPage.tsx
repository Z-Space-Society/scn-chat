import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'
import { ChatList } from '../../chat-list/components/ChatList.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { BusyBanner } from '../components/BusyBanner.tsx'
import { ConversationView } from '../components/ConversationView.tsx'

interface Props {
  skey?: string
}

/** The chats: the chat list beside the open conversation, or a prompt to open one. */
export function ChatPage(props: Props) {
  const { error } = useModels()
  return (
    <SidebarLayout className="chats" nav={<ChatList />}>
      <BusyBanner />
      <ErrorAlert error={error} />
      {props.skey ? (
        <ConversationView key={props.skey} skey={props.skey} />
      ) : (
        <p>Start a new chat, or pick one from the list.</p>
      )}
    </SidebarLayout>
  )
}
