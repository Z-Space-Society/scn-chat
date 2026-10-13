import type { ReactNode } from 'react'
import type { BlobUrl } from '../../../parts/types.ts'
import type { BranchMessage, BranchStep } from '../lib/branch.ts'
import { MessageView } from './MessageView.tsx'

interface Props {
  branch: BranchStep[]
  blobUrl: BlobUrl
  /** Show another version of a message, by its rkey. */
  onPick: (rkey: string) => void
  /** What a pending message shows as it streams, such as its stream. */
  pending?: (message: BranchMessage) => ReactNode
  /** What a pending reply's header shows in place of its author, such as its live status. */
  live?: (message: BranchMessage) => ReactNode
  /** The controls under a message. */
  actions?: (message: BranchMessage) => ReactNode
  /** What a failed reply offers beside its error, such as a button to try again. */
  retry?: (message: BranchMessage) => ReactNode
  /** Whether a message arrived while the chat was open, so it fades in. */
  arrived?: (message: BranchMessage) => boolean
}

/** The messages on the branch on screen, each with its versions, and the id `m-<rkey>`. */
export function BranchView(props: Props) {
  return (
    <>
      {props.branch.map(({ message, siblings, index }) => (
        <MessageView
          key={message.rkey}
          id={`m-${message.rkey}`}
          rkey={message.rkey}
          record={message.record}
          pending={message.record.status === 'pending' ? props.pending?.(message) : undefined}
          live={message.record.status === 'pending' ? props.live?.(message) : undefined}
          blobUrl={props.blobUrl}
          siblings={{ messages: siblings, index, onPick: props.onPick }}
          actions={props.actions?.(message)}
          retry={message.record.status === 'error' ? props.retry?.(message) : undefined}
          arrived={props.arrived?.(message)}
        />
      ))}
    </>
  )
}
