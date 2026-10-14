import { createFileRoute } from '@tanstack/react-router'
import { loadConversationView } from '../../../../features/conversation/lib/load-conversation.ts'
import { ChatPage } from '../../../../features/conversation/pages/ChatPage.tsx'
import { validateBranchSearch } from '../../../../shared/search-params.ts'

export const Route = createFileRoute('/_app/_chats/chat/$skey')({
  validateSearch: validateBranchSearch,
  // The conversation's code downloads alongside the route's, not once the page renders.
  loader: () => {
    void loadConversationView()
  },
  component: Conversation,
})

function Conversation() {
  const { skey } = Route.useParams()
  return <ChatPage skey={skey} />
}
