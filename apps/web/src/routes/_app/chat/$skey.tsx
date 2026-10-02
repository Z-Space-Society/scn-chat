import { createFileRoute } from '@tanstack/react-router'
import { validateBranchSearch, validateChatListSearch } from '../../../lib/search-params.ts'
import { ChatPage } from '../../../pages/ChatPage.tsx'

export const Route = createFileRoute('/_app/chat/$skey')({
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateChatListSearch(search),
    ...validateBranchSearch(search),
  }),
  component: Conversation,
})

function Conversation() {
  const { skey } = Route.useParams()
  return <ChatPage skey={skey} />
}
