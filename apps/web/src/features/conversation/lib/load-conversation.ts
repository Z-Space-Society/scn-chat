/**
 * The conversation's code, which brings the Markdown renderer replies are drawn with, so it
 * downloads only once a chat opens or is about to: when the chat route loads, or once the page for
 * a new chat has shown.
 */
export const loadConversationView = () => import('../components/ConversationView.tsx')
