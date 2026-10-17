import type { ReactNode, Ref } from 'react'
import { messageText } from '../../../store/core.ts'
import type { OutgoingMessage } from '../chat.ts'
import { type BranchMessage, type BranchStep, inheritedModel } from '../lib/branch.ts'
import { Composer, type ComposerHandle } from './Composer.tsx'

interface Props {
  branch: BranchStep[]
  /** The user message being edited, if any. */
  editing: BranchMessage | undefined
  /** Send a message to the conversation, as a reply or an edit. */
  send: (message: OutgoingMessage) => Promise<unknown>
  /** An edit was sent, as a new sibling of the edited message. */
  onEdited: () => void
  onCancelEdit: () => void
  /** Whether the chat's messages are still on their way. */
  waiting: boolean
  /** Stop the reply running at the end of the branch, offered in place of Send. */
  onStop?: () => void
  /** What floats just above the composer, such as a button that jumps to the latest message. */
  above?: ReactNode
  ref?: Ref<ComposerHandle>
}

/** The composer: replying at the end of the branch, or editing one of its messages. */
// The ref is kept out of `props`, as in the composer, so React Compiler still memoizes this.
export function BranchComposer({ ref, ...props }: Props) {
  if (props.editing) {
    const parent = props.editing.record.parent
    return (
      <Composer
        // Editing another message starts the composer over from that message.
        key={`edit-${props.editing.rkey}`}
        ref={ref}
        above={props.above}
        parent={parent}
        inherited={inheritedModel(props.branch, parent)}
        initialText={messageText(props.editing.record)}
        send={async (message) => {
          await props.send(message)
          props.onEdited()
        }}
        onCancel={props.onCancelEdit}
      />
    )
  }
  const leaf = props.branch.at(-1)?.message.rkey
  return (
    <Composer
      key="reply"
      ref={ref}
      above={props.above}
      onStop={props.onStop}
      parent={leaf}
      waiting={props.waiting}
      inherited={inheritedModel(props.branch, leaf)}
      send={props.send}
    />
  )
}
