import { useState } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useConversation } from '../../../store/react.tsx'
import { useBranch } from '../hooks/useBranch.ts'
import { useConversationActions } from '../hooks/useConversationActions.ts'
import { useReplyStream } from '../hooks/useReplyStream.ts'
import { useScrollToFocus } from '../hooks/useScrollToFocus.ts'
import { useStickToBottom } from '../hooks/useStickToBottom.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { BranchComposer } from './BranchComposer.tsx'
import { BranchView } from './BranchView.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { type ConversationOperations, MessageActions } from './message-actions.tsx'
import { ReplyStream } from './ReplyStream.tsx'

interface Props {
  skey: string
}

/** A conversation: its header, the branch on screen with replies streaming in, and the composer. */
export function ConversationView(props: Props) {
  const { conversation, error: loadError } = useConversation(props.skey)
  // The user message being edited, by rkey, so the composer reads it from the conversation.
  const [editingRkey, setEditingRkey] = useState<string | null>(null)
  const messages = conversation?.messages ?? []
  const pending = messages.filter((m) => m.record.status === 'pending').map((m) => m.rkey)
  const { follow } = useReplyStream(props.skey, pending)

  const { focus, branch, pick } = useBranch(messages)
  // Opening the conversation on a message scrolls to that message instead.
  const { ref: stickToBottom, pin } = useStickToBottom(!focus)
  const { stayOn } = useScrollToFocus(
    focus,
    branch.some((step) => step.message.rkey === focus),
  )
  /** Focus a message without scrolling to it, as when switching siblings. */
  const choose = (rkey: string) => {
    stayOn(rkey)
    pick(rkey)
  }
  const actions = useConversationActions(props.skey, (replyRkey) => {
    choose(replyRkey)
    follow(replyRkey)
  })
  const operations: ConversationOperations = {
    edit: setEditingRkey,
    regenerate: actions.regenerate,
    stop: actions.stop,
  }
  const sent = (message: { replyRkey: string | null }) => {
    pin()
    if (message.replyRkey) follow(message.replyRkey)
  }

  return (
    <section className="conversation" ref={stickToBottom}>
      <ConversationHeader
        skey={props.skey}
        title={(conversation?.info?.title as string | undefined) ?? 'New chat'}
        onRename={actions.rename}
        onSync={actions.sync}
      />
      <ErrorAlert error={actions.error ?? loadError} />
      <BranchView
        branch={branch}
        blobUrl={blobUrlFor(`/api/conversations/${props.skey}`)}
        onPick={choose}
        pending={(message) => <ReplyStream skey={props.skey} rkey={message.rkey} />}
        actions={(message) => <MessageActions message={message} operations={operations} />}
      />
      <BranchComposer
        skey={props.skey}
        branch={branch}
        editing={messages.find((m) => m.rkey === editingRkey)}
        onSent={sent}
        onEdited={(message) => {
          setEditingRkey(null)
          choose(message.rkey)
          sent(message)
        }}
        onCancelEdit={() => setEditingRkey(null)}
      />
    </section>
  )
}
