import type { ReactNode } from 'react'
import type { BlobUrl } from '../../../parts/types.ts'
import type { BranchMessage, BranchStep } from '../lib/branch.ts'
import { MessageView } from './MessageView.tsx'

interface Props {
  branch: BranchStep[]
  blobUrl: BlobUrl
  /** Show another version of a message, by its rkey. */
  onPick: (rkey: string) => void
  /** What a pending message shows in place of "Thinking...", such as its stream. */
  pending?: (message: BranchMessage) => ReactNode
  /** The controls under a message. */
  actions?: (message: BranchMessage) => ReactNode
}

/** The messages on the branch on screen, each with its versions, and the id `m-<rkey>`. */
export function BranchView(props: Props) {
  return (
    <>
      {props.branch.map(({ message, siblings, index }) => (
        <MessageView
          key={message.rkey}
          id={`m-${message.rkey}`}
          record={message.record}
          pending={message.record.status === 'pending' ? props.pending?.(message) : undefined}
          blobUrl={props.blobUrl}
          siblings={{ messages: siblings, index, onPick: props.onPick }}
          actions={props.actions?.(message)}
        />
      ))}
    </>
  )
}
