import { Link, useLocation } from 'wouter'
import { api, read } from '../api.ts'
import { useConversations } from '../store/react.tsx'
import { useAction } from './useAction.ts'
import { useSignOut } from './useSignOut.ts'

export function ChatList() {
  const { conversations, error: loadError } = useConversations()
  const { error, run } = useAction()
  const signOut = useSignOut()
  const [, navigate] = useLocation()
  const create = async () => {
    const created = await read(api.chats.conversations.$post())
    navigate(`/c/${created.skey}`)
  }
  return (
    <nav className="chat-list">
      <button type="button" onClick={() => run(create)}>
        New chat
      </button>
      {(error ?? loadError) && <p role="alert">{error ?? loadError}</p>}
      <ul>
        {conversations.map((c) => (
          <li key={c.skey}>
            <Link href={`/c/${c.skey}`}>{c.title || 'New chat'}</Link>
          </li>
        ))}
      </ul>
      <Link href="/settings">Settings</Link>
      <button type="button" onClick={() => run(signOut)}>
        Sign out
      </button>
    </nav>
  )
}
