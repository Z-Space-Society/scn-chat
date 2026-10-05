import { ChatList } from '../../chat-list/components/ChatList.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { BusyBanner } from '../components/BusyBanner.tsx'
import { ConversationView } from '../components/ConversationView.tsx'

export function ChatPage({ skey }: { skey?: string }) {
  const { error } = useModels()
  return (
    <div className="layout">
      <ChatList />
      <main>
        <BusyBanner />
        {error && <p role="alert">{error}</p>}
        {skey ? (
          <ConversationView key={skey} skey={skey} />
        ) : (
          <p>Start a new chat, or pick one from the list.</p>
        )}
      </main>
    </div>
  )
}
