import { useSuspenseQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { button } from '../../../shared/ui/Button.tsx'
import { BranchView } from '../../conversation/components/BranchView.tsx'
import { DetailsButton, recordRows } from '../../conversation/components/RecordDetails.tsx'
import { useBranch } from '../../conversation/hooks/useBranch.ts'
import { blobUrlFor } from '../../conversation/lib/blob-url.ts'
import { sharedQuery } from '../queries.ts'
import { SharedColumn, SharedState } from './SharedStates.tsx'

interface Props {
  ownerDid: string
  skey: string
  signedIn: boolean
}

/** A shared conversation, read-only, once the viewer has signed in. */
export function SharedPage(props: Props) {
  const pathname = useLocation({ select: (location) => location.pathname })
  if (!props.signedIn)
    return (
      <SharedState>
        <p>Sign in with your atproto account to view this shared chat.</p>
        <a
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className={button({ tone: 'primary' })}
        >
          Sign in
        </a>
      </SharedState>
    )
  return <SharedChat ownerDid={props.ownerDid} skey={props.skey} />
}

interface ChatProps {
  ownerDid: string
  skey: string
}

/**
 * The conversation, which the route's loader starts fetching, so the route shows its skeleton
 * while it loads and its error page if it fails.
 */
function SharedChat(props: ChatProps) {
  const { data: shared } = useSuspenseQuery(sharedQuery(props.ownerDid, props.skey))
  const messages = shared.messages.map((m) => ({
    rkey: m.rkey,
    record: m.value as Record<string, unknown>,
  }))
  const { branch, pick } = useBranch(messages)
  return (
    <SharedColumn>
      <header className="mb-4">
        <h1 className="text-balance font-semibold text-ink-strong text-title leading-tight tracking-title">
          {shared.title ?? 'Shared chat'}
        </h1>
        <p className="mt-1 text-muted text-ui">
          Shared by {shared.owner.handle ?? shared.owner.did}
        </p>
      </header>
      <BranchView
        branch={branch}
        blobUrl={blobUrlFor(`/api/shared/${props.ownerDid}/${props.skey}`)}
        onPick={pick}
        // Reading a message's details is its only action here.
        actions={(message) => <DetailsButton rows={recordRows({ record: message.record })} />}
      />
    </SharedColumn>
  )
}
