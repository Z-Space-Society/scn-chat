import { useState } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { RetryIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { useConversation } from '../../../store/react.tsx'
import { useMe } from '../../auth/session.ts'
import { useModels } from '../../models/hooks/useModels.ts'
import { useBranch } from '../hooks/useBranch.ts'
import { useConversationActions } from '../hooks/useConversationActions.ts'
import { useReplyStream } from '../hooks/useReplyStream.ts'
import { useScrollToFocus } from '../hooks/useScrollToFocus.ts'
import { useStickToBottom } from '../hooks/useStickToBottom.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { outlineOf } from '../lib/outline.ts'
import { BranchComposer } from './BranchComposer.tsx'
import { BranchView } from './BranchView.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { LiveAuthor } from './LiveAuthor.tsx'
import { type ConversationOperations, MessageActions } from './message-actions.tsx'
import { ReplyStream } from './ReplyStream.tsx'

interface Props {
  skey: string
}

/** A conversation: its header, the branch on screen with replies streaming in, and the composer. */
export function ConversationView(props: Props) {
  const { conversation, error: loadError } = useConversation(props.skey)
  const me = useMe()
  const { models } = useModels()
  // The user message being edited, by rkey, so the composer reads it from the conversation.
  const [editingRkey, setEditingRkey] = useState<string | null>(null)
  const messages = conversation?.messages ?? []
  // The messages there when the chat first loaded, which show at once. Only later ones fade in.
  const [opened, setOpened] = useState<Set<string> | null>(null)
  if (opened === null && conversation) setOpened(new Set(messages.map((m) => m.rkey)))
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
    models,
    storedIn:
      me.storageMode === 'space'
        ? "This chat's space on your PDS"
        : "This server's local storage, since your PDS doesn't support spaces yet",
  }
  const sent = (message: { replyRkey: string | null }) => {
    pin()
    if (message.replyRkey) follow(message.replyRkey)
  }

  const blobUrl = blobUrlFor(`/api/conversations/${props.skey}`)

  return (
    // The conversation keeps main's stand-in class until its composer is ported.
    <section
      ref={stickToBottom}
      className="conversation mx-auto flex w-full max-w-column flex-1 flex-col px-gutter"
    >
      <ConversationHeader
        skey={props.skey}
        title={(conversation?.info?.title as string | undefined) ?? 'New chat'}
        outline={outlineOf(branch)}
        onRename={actions.rename}
        onSync={actions.sync}
      />
      <ErrorAlert error={actions.error ?? loadError} />
      <BranchView
        branch={branch}
        blobUrl={blobUrl}
        onPick={choose}
        pending={(message) => (
          <ReplyStream skey={props.skey} rkey={message.rkey} blobUrl={blobUrl} />
        )}
        live={(message) => (
          <LiveAuthor
            skey={props.skey}
            rkey={message.rkey}
            model={(message.record.model as { id?: string } | undefined)?.id ?? 'Assistant'}
            since={message.record.createdAt}
          />
        )}
        actions={(message) => <MessageActions message={message} operations={operations} />}
        // A failed reply tries again with the same model.
        retry={(message) => (
          <Button
            size="small"
            className="mt-2.5"
            disabled={actions.regenerating}
            onClick={() =>
              actions.regenerate((message.record.parent as string | undefined) ?? null, null)
            }
          >
            <RetryIcon className="size-3.75 text-muted" />
            Try again
          </Button>
        )}
        arrived={(message) => !opened?.has(message.rkey)}
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
