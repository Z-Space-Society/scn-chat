import { useQuery } from '@tanstack/react-query'
import { BusyBanner } from '../components/BusyBanner.tsx'
import { ChatList } from '../components/ChatList.tsx'
import type { ModelOption } from '../components/Composer.tsx'
import { ConversationView } from '../components/ConversationView.tsx'
import { messageOf } from '../lib/errors.ts'
import { modelsQuery } from '../queries.ts'

export function useModels(): { models: ModelOption[]; error: string | null } {
  const { data, error } = useQuery(modelsQuery)
  return {
    models: data?.models ?? [],
    error: error ? `Could not load models: ${messageOf(error)}` : null,
  }
}

export function ChatPage({ skey }: { skey?: string }) {
  const { models, error } = useModels()
  return (
    <div className="layout">
      <ChatList />
      <main>
        <BusyBanner />
        {error && <p role="alert">{error}</p>}
        {skey ? (
          <ConversationView key={skey} skey={skey} models={models} />
        ) : (
          <p>Start a new chat, or pick one from the list.</p>
        )}
      </main>
    </div>
  )
}
