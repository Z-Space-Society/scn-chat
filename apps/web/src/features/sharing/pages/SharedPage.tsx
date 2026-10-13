import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { button } from '../../../shared/ui/Button.tsx'
import { BranchView } from '../../conversation/components/BranchView.tsx'
import { DetailsButton, recordRows } from '../../conversation/components/RecordDetails.tsx'
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
  if (error)
    return (
      <SharedState>
        <ErrorAlert error={error} />
      </SharedState>
    )
  if (!shared)
    return (
      <SharedState>
        <p>Loading…</p>
      </SharedState>
    )
  return (
    // The conversation's own column on the panel, read-only, under its title and who shared it.
    <main className="min-h-dvh bg-panel">
      <div className="mx-auto flex w-full max-w-column flex-col px-gutter pt-8 pb-16">
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
      </div>
    </main>
  )
}

interface StateProps {
  children: ReactNode
}

/** What the page says in place of the chat, such as asking the viewer to sign in, centered on the panel. */
function SharedState(props: StateProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-panel px-gutter text-center text-body text-muted">
      {props.children}
    </main>
  )
}
