import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'

/**
 * The page's frame, the sidebar and the panel with nothing in them yet, while its code loads. The
 * server sends it in place of the chats, which only render in the browser, so a reload never
 * starts on a blank window.
 */
export function ChatPageFrame() {
  return <SidebarLayout kind="chats" frame />
}
