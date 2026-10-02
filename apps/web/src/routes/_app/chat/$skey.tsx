import { createFileRoute } from '@tanstack/react-router'
import { ChatPage } from '../../../pages/ChatPage.tsx'

export const Route = createFileRoute('/_app/chat/$skey')({
  // `m` focuses a message, as search results link to it.
  validateSearch: (search: Record<string, unknown>): { m?: string } =>
    typeof search.m === 'string' ? { m: search.m } : {},
  component: Conversation,
})

function Conversation() {
  const { skey } = Route.useParams()
  return <ChatPage skey={skey} />
}
