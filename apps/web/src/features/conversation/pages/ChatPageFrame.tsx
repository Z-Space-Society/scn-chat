import { useParams } from '@tanstack/react-router'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'
import { ChatListSkeleton } from '../../chat-list/components/ChatListSkeleton.tsx'
import { ConversationFrame } from '../components/ConversationFrame.tsx'

/**
 * The page's frame while its code loads: the sidebar with skeletons of the chats, and the panel
 * with the composer to type in. The server sends it in place of the chats, which only render in
 * the browser, so a reload never starts on a blank window.
 */
export function ChatPageFrame() {
  const skey = useParams({ strict: false, select: (params) => params.skey })
  return (
    <SidebarLayout kind="chats" frame nav={<ChatListSkeleton />}>
      <ConversationFrame open={skey !== undefined} immediate />
    </SidebarLayout>
  )
}
