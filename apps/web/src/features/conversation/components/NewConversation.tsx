import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useStartChat } from '../chat.ts'
import { useFileDrop } from '../hooks/useFileDrop.ts'
import { loadConversationView } from '../lib/load-conversation.ts'
import { Composer, type ComposerHandle } from './Composer.tsx'
import { EmptyConversation } from './EmptyConversation.tsx'

/**
 * The page without an open chat: an empty conversation whose first message creates the chat,
 * then opens it.
 */
export function NewConversation() {
  const navigate = useNavigate()
  const start = useStartChat()
  const composer = useRef<ComposerHandle>(null)
  const drop = useFileDrop(composer)
  // Once the page shows, the conversation its first message opens starts downloading, so it's
  // there by the time the message is sent.
  useEffect(() => {
    void loadConversationView()
  }, [])
  return (
    <section {...drop} className="mx-auto flex w-full max-w-column flex-1 flex-col px-gutter">
      <EmptyConversation onStart={(text) => composer.current?.fill(text)} />
      <Composer
        ref={composer}
        send={async (message) => {
          const { skey } = await start(message)
          void navigate({ to: '/chat/$skey', params: { skey } })
        }}
      />
    </section>
  )
}
