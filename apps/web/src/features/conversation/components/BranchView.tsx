import { memo, type ReactNode } from 'react'
import type { BlobUrl } from '../../../parts/types.ts'
import type { BranchMessage, BranchStep } from '../lib/branch.ts'
import { MessageView } from './MessageView.tsx'
import type { Siblings } from './SiblingPicker.tsx'

/** What the conversation gives every message on the branch. */
interface RowOptions {
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

interface Props extends RowOptions {
  branch: BranchStep[]
}

/** The messages on the branch on screen, each with its versions, and the id `m-<rkey>`. */
export function BranchView(props: Props) {
  return (
    <>
      {props.branch.map((step) => (
        <BranchRow
          key={step.message.rkey}
          message={step.message}
          index={step.index}
          count={step.siblings.length}
          previous={step.siblings[step.index - 1]?.rkey}
          next={step.siblings[step.index + 1]?.rkey}
          blobUrl={props.blobUrl}
          onPick={props.onPick}
          pending={props.pending}
          live={props.live}
          actions={props.actions}
          retry={props.retry}
          arrived={props.arrived}
        />
      ))}
    </>
  )
}

/** Its versions as numbers and keys, apart, so `memo` compares each on its own. */
interface RowProps extends RowOptions, Omit<Siblings, 'onPick'> {
  message: BranchMessage
}

/**
 * One message on the branch. It renders again only when its own record or its place among its
 * versions changes, since the local copy keeps an unchanged message the same object, so a message
 * arriving or a reply finishing doesn't render every other message again.
 */
const BranchRow = memo(function BranchRow(props: RowProps) {
  const message = props.message
  const status = message.record.status
  return (
    <MessageView
      id={`m-${message.rkey}`}
      rkey={message.rkey}
      record={message.record}
      pending={status === 'pending' ? props.pending?.(message) : undefined}
      live={status === 'pending' ? props.live?.(message) : undefined}
      blobUrl={props.blobUrl}
      siblings={{
        index: props.index,
        count: props.count,
        previous: props.previous,
        next: props.next,
        onPick: props.onPick,
      }}
      actions={props.actions?.(message)}
      retry={status === 'error' ? props.retry?.(message) : undefined}
      arrived={props.arrived?.(message)}
    />
  )
})
