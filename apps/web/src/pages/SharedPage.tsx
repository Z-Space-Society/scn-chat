import { useEffect, useState } from 'react'
import { api, read } from '../api.ts'
import { MessageView } from '../components/MessageView.tsx'
import { currentBranch } from '../lib/branch.ts'

type Shared = Awaited<ReturnType<typeof load>>

const load = (ownerDid: string, skey: string) =>
  read(api.sharing.shared[':ownerDid'][':skey'].$get({ param: { ownerDid, skey } }))

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
  const [shared, setShared] = useState<Shared | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!signedIn) return
    load(ownerDid, skey)
      .then(setShared)
      .catch((err: Error) => setError(err.message))
  }, [ownerDid, skey, signedIn])

  if (!signedIn) {
    return (
      <main>
        <p>Sign in with your atproto account to view this shared chat.</p>
        <a href={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in</a>
      </main>
    )
  }
  if (error) return <main role="alert">{error}</main>
  if (!shared) return <main>Loading...</main>

  const messages = shared.messages.map((m) => ({
    rkey: m.rkey,
    record: m.value as Record<string, unknown>,
  }))
  const blobUrl = (cid: string, mimeType?: string) =>
    `/api/shared/${ownerDid}/${skey}/blobs/${cid}${mimeType ? `?type=${encodeURIComponent(mimeType)}` : ''}`
  return (
    <main className="conversation">
      <h2>{shared.title ?? 'Shared chat'}</h2>
      <p>Shared by {shared.owner.handle ?? shared.owner.did}</p>
      {currentBranch(messages, chosen).map(({ message, siblings, index }) => {
        const parent = (message.record.parent as string | undefined) ?? ''
        return (
          <MessageView
            key={message.rkey}
            record={message.record}
            blobUrl={blobUrl}
            siblings={{
              index,
              count: siblings.length,
              onPick: (i) =>
                setChosen((c) => ({ ...c, [parent]: (siblings[i] as { rkey: string }).rkey })),
            }}
          />
        )
      })}
    </main>
  )
}
