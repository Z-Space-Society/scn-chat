import { createFileRoute } from '@tanstack/react-router'
import { validateChatListSearch } from '../../../lib/search-params.ts'
import { ChatPage } from '../../../pages/ChatPage.tsx'

export const Route = createFileRoute('/_app/_chats/')({
  validateSearch: validateChatListSearch,
  component: () => <ChatPage />,
})
