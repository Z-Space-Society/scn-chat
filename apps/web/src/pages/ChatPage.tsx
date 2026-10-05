import { useEffect, useState } from 'react'
import { api, read } from '../api.ts'
import { BusyBanner } from '../components/BusyBanner.tsx'
import { ChatList } from '../components/ChatList.tsx'
import type { ModelOption } from '../components/Composer.tsx'
import { ConversationView } from '../components/ConversationView.tsx'
import { messageOf } from '../components/useAction.ts'

export function useModels(): { models: ModelOption[]; loaded: boolean; error: string | null } {
  const [models, setModels] = useState<ModelOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    read(api.providers.models.$get())
      .then((body) => {
        setModels(body.models)
        setLoaded(true)
      })
      .catch((err: unknown) => setError(`Could not load models: ${messageOf(err)}`))
  }, [])
  return { models, loaded, error }
}

export function ChatPage({ skey }: { skey?: string }) {
  const { models, loaded, error } = useModels()
  return (
    <div className="layout">
      <ChatList />
      <main>
        <BusyBanner />
        {error && <p role="alert">{error}</p>}
        {skey ? (
          <ConversationView
            key={skey}
            skey={skey}
            models={models}
            noModels={loaded && models.length === 0}
          />
        ) : (
          <p>Start a new chat, or pick one from the list.</p>
        )}
      </main>
    </div>
  )
}
