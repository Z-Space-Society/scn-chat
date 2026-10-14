import type { ErrorComponentProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { RouteError } from '../../../shared/route-states.tsx'
import { Loading, SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { MessagesSkeleton } from '../../conversation/components/ConversationSkeleton.tsx'

/*
 * The shared page's frame, its skeleton, and its error page. The route names its pending and error
 * pages directly, so they load with the app's entry: they stay apart from the page itself, which
 * draws the messages and so brings the Markdown renderer.
 */

interface ColumnProps {
  children: ReactNode
}

/** The conversation's own column on the panel, read-only, under its title and who shared it. */
export function SharedColumn(props: ColumnProps) {
  return (
    <main className="min-h-dvh bg-panel">
      <div className="mx-auto flex w-full max-w-column flex-col px-gutter pt-8 pb-16">
        {props.children}
      </div>
    </main>
  )
}

/**
 * The shared chat on its way: its title and who shared it, over a few paragraphs of text. It is
 * the route's pending page, which the server sends and the router otherwise holds back until
 * loading takes a while, so it shows at once.
 */
export function SharedPageSkeleton() {
  return (
    <SharedColumn>
      <Loading label="Loading the shared chat" immediate>
        <div className="mb-4">
          <SkeletonText className="w-64 max-w-full text-title leading-tight" />
          <SkeletonText className="mt-1 w-40 text-ui" />
        </div>
        <MessagesSkeleton />
      </Loading>
    </SharedColumn>
  )
}

interface StateProps {
  children: ReactNode
}

/** What the page says in place of the chat, such as asking the viewer to sign in, centered on the panel. */
export function SharedState(props: StateProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-panel px-gutter text-center text-body text-muted">
      {props.children}
    </main>
  )
}

/** What the page shows when the chat can't be read, centered on the panel, with a way to retry. */
export function SharedError(props: ErrorComponentProps) {
  return (
    <SharedState>
      <RouteError {...props} />
    </SharedState>
  )
}
