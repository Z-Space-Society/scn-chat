import { ComposerFrame } from './ComposerFrame.tsx'
import { ConversationSkeleton } from './ConversationSkeleton.tsx'
import { HeaderFrame } from './HeaderFrame.tsx'

interface Props {
  /** Whether a chat is open, rather than a new one. */
  open: boolean
  /** Whether its skeleton shows at once, as in a page the server sends. */
  immediate?: boolean
}

/**
 * The conversation's column while its code loads: an open chat's header and messages on their
 * way, over the composer's frame.
 */
export function ConversationFrame(props: Props) {
  return (
    <section className="mx-auto flex w-full max-w-column flex-1 flex-col px-gutter">
      {props.open && (
        <>
          <HeaderFrame />
          <ConversationSkeleton immediate={props.immediate} />
        </>
      )}
      <ComposerFrame waiting={props.open} />
    </section>
  )
}
