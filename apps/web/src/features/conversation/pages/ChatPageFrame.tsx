import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'
import { ChatListSkeleton } from '../../chat-list/components/ChatListSkeleton.tsx'

/**
 * The page's frame while its code loads: the sidebar with skeletons of the chats, and the panel
 * empty. The server sends it in place of the chats, which only render in the browser, so a reload
 * never starts on a blank window.
 */
export function ChatPageFrame() {
  return <SidebarLayout kind="chats" frame nav={<ChatListSkeleton />} />
}
