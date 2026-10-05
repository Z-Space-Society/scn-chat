import { createFileRoute } from '@tanstack/react-router'
import { ChatPage } from '../../../pages/ChatPage.tsx'

export const Route = createFileRoute('/_app/_chats/')({
  component: () => <ChatPage />,
})
