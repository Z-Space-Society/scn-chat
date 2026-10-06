import { createFileRoute } from '@tanstack/react-router'
import { ChatPage } from '../../../../features/conversation/pages/ChatPage.tsx'
import { validateBranchSearch } from '../../../../shared/search-params.ts'

export const Route = createFileRoute('/_app/_chats/chat/$skey')({
  validateSearch: validateBranchSearch,
  component: Conversation,
})

function Conversation() {
  const { skey } = Route.useParams()
  return <ChatPage skey={skey} />
}
