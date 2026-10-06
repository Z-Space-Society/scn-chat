import { ChatList } from '../../chat-list/components/ChatList.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { BusyBanner } from '../components/BusyBanner.tsx'
import { ConversationView } from '../components/ConversationView.tsx'

interface Props {
  skey?: string
}

export function ChatPage(props: Props) {
  const { error } = useModels()
  return (
    <div className="layout">
      <ChatList />
      <main>
        <BusyBanner />
        {error && <p role="alert">{error}</p>}
        {props.skey ? (
          <ConversationView key={props.skey} skey={props.skey} />
        ) : (
          <p>Start a new chat, or pick one from the list.</p>
        )}
      </main>
    </div>
  )
}
