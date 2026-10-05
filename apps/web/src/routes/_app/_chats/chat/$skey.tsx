import { createFileRoute } from '@tanstack/react-router'
import { validateBranchSearch } from '../../../../lib/search-params.ts'
import { ChatPage } from '../../../../pages/ChatPage.tsx'

export const Route = createFileRoute('/_app/_chats/chat/$skey')({
  validateSearch: validateBranchSearch,
  component: Conversation,
})

function Conversation() {
  const { skey } = Route.useParams()
  return <ChatPage skey={skey} />
}
