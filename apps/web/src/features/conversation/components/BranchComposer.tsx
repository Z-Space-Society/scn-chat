import { messageText } from '../../../store/core.ts'
import { type BranchMessage, type BranchStep, inheritedModel } from '../lib/branch.ts'
import { Composer, type ComposerProps } from './Composer.tsx'

type Sent = Parameters<ComposerProps['onSent']>[0]

interface Props {
  skey: string
  branch: BranchStep[]
  /** The user message being edited, if any. */
  editing: BranchMessage | undefined
  /** A reply was sent under the branch's last message. */
  onSent: (sent: Sent) => void
  /** An edit was sent, as a new sibling of the edited message. */
  onEdited: (sent: Sent) => void
  onCancelEdit: () => void
}

/** The composer: replying at the end of the branch, or editing one of its messages. */
export function BranchComposer(props: Props) {
  if (props.editing) {
    const parent = props.editing.record.parent as string | undefined
    return (
      <Composer
        // Editing another message starts the composer over from that message.
        key={`edit-${props.editing.rkey}`}
        skey={props.skey}
        parent={parent}
        inherited={inheritedModel(props.branch, parent)}
        initialText={messageText(props.editing.record)}
        onSent={props.onEdited}
        onCancel={props.onCancelEdit}
      />
    )
  }
  const leaf = props.branch.at(-1)?.message.rkey
  return (
    <Composer
      key="reply"
      skey={props.skey}
      parent={leaf}
      inherited={inheritedModel(props.branch, leaf)}
      onSent={props.onSent}
    />
  )
}
