import { useQuery } from '@tanstack/react-query'
import { MessageView } from '../components/MessageView.tsx'
import { useBranch } from '../components/useBranch.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { messageOf } from '../lib/errors.ts'
import { sharedQuery } from '../queries.ts'

/** A shared conversation, read-only. */
export function SharedPage({
  ownerDid,
  skey,
  signedIn,
}: {
  ownerDid: string
  skey: string
  signedIn: boolean
}) {
  const { data: shared, error } = useQuery({ ...sharedQuery(ownerDid, skey), enabled: signedIn })
  const messages = (shared?.messages ?? []).map((m) => ({
    rkey: m.rkey,
    record: m.value as Record<string, unknown>,
  }))
  const { branch, pick } = useBranch(messages)

  if (!signedIn) {
    return (
      <main>
        <p>Sign in with your atproto account to view this shared chat.</p>
        <a href={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</a>
      </main>
    )
  }
  if (error) return <main role="alert">{messageOf(error)}</main>
  if (!shared) return <main>Loading...</main>

  const blobUrl = blobUrlFor(`/api/shared/${ownerDid}/${skey}`)
  return (
    <main className="conversation">
      <h2>{shared.title ?? 'Shared chat'}</h2>
      <p>Shared by {shared.owner.handle ?? shared.owner.did}</p>
      {branch.map(({ message, siblings, index, parent }) => {
        return (
          <MessageView
            key={message.rkey}
            record={message.record}
            blobUrl={blobUrl}
            siblings={{
              index,
              count: siblings.length,
              onPick: (i) => pick(parent, (siblings[i] as { rkey: string }).rkey),
            }}
          />
        )
      })}
    </main>
  )
}
