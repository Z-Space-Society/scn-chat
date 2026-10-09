import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { BranchView } from '../../conversation/components/BranchView.tsx'
import { useBranch } from '../../conversation/hooks/useBranch.ts'
import { blobUrlFor } from '../../conversation/lib/blob-url.ts'
import { sharedQuery } from '../queries.ts'

interface Props {
  ownerDid: string
  skey: string
  signedIn: boolean
}

/** A shared conversation, read-only. */
export function SharedPage(props: Props) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { data: shared, error } = useQuery({
    ...sharedQuery(props.ownerDid, props.skey),
    enabled: props.signedIn,
  })
  const messages = (shared?.messages ?? []).map((m) => ({
    rkey: m.rkey,
    record: m.value as Record<string, unknown>,
  }))
  const { branch, pick } = useBranch(messages)

  if (!props.signedIn)
    return (
      <main>
        <p>Sign in with your atproto account to view this shared chat.</p>
        <a href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</a>
      </main>
    )
  if (error)
    return (
      <main>
        <ErrorAlert error={error} />
      </main>
    )
  if (!shared) return <main>Loading...</main>
  return (
    <main className="conversation">
      <h2>{shared.title ?? 'Shared chat'}</h2>
      <p>Shared by {shared.owner.handle ?? shared.owner.did}</p>
      <BranchView
        branch={branch}
        blobUrl={blobUrlFor(`/api/shared/${props.ownerDid}/${props.skey}`)}
        onPick={pick}
      />
    </main>
  )
}
