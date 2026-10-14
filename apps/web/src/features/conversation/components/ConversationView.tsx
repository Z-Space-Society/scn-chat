import { useRef, useState } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { JumpDownIcon, RetryIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { useDocumentTitle } from '../../../shared/useDocumentTitle.ts'
import { useConversation } from '../../../store/react.tsx'
import { useMe } from '../../auth/session.ts'
import { useModels } from '../../models/hooks/useModels.ts'
import { useBranch } from '../hooks/useBranch.ts'
import { useConversationActions } from '../hooks/useConversationActions.ts'
import { useFileDrop } from '../hooks/useFileDrop.ts'
import { useScrollToFocus } from '../hooks/useScrollToFocus.ts'
import { type Following, useAtBottom, useStickToBottom } from '../hooks/useStickToBottom.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { outlineOf } from '../lib/outline.ts'
import { useReplyFollower } from '../reply-follower.ts'
import { BranchComposer } from './BranchComposer.tsx'
import { BranchView } from './BranchView.tsx'
import type { ComposerHandle } from './Composer.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { ConversationSkeleton } from './ConversationSkeleton.tsx'
import { EmptyConversation } from './EmptyConversation.tsx'
import { LiveAuthor } from './LiveAuthor.tsx'
import { type ConversationOperations, MessageActions } from './message-actions.tsx'
import { ReplyStream } from './ReplyStream.tsx'

interface Props {
  skey: string
}

/** A conversation: its header, the branch on screen with replies streaming in, and the composer. */
export function ConversationView(props: Props) {
  const {
    conversation,
    isLoading,
    refreshed,
    refreshing,
    error: loadError,
  } = useConversation(props.skey)
  const me = useMe()
  const { models } = useModels()
  // The user message being edited, by rkey, so the composer reads it from the conversation.
  const [editingRkey, setEditingRkey] = useState<string | null>(null)
  const messages = conversation?.messages ?? []
  // The messages are on their way until the local copy answers, or, when it has none, until the
  // PDS has. While another tab holds the copy, the banner over the page says why instead.
  const waiting = isLoading || (messages.length === 0 && refreshing)
  // Every chat has an info record from its creation, so until it arrives, from the local copy or
  // the PDS, the chat's title and instructions are unknown rather than empty.
  const info = conversation?.info ?? null
  const title = waiting && !info ? undefined : ((info?.title as string | undefined) ?? 'New chat')
  useDocumentTitle(title)
  // The messages there when the chat first loaded, which show at once. Only later ones fade in.
  const [opened, setOpened] = useState<Set<string> | null>(null)
  if (opened === null && conversation) setOpened(new Set(messages.map((m) => m.rkey)))
  const { follow } = useReplyFollower(props.skey, messages)

  const { focus, branch, pick } = useBranch(messages)
  // Opening the conversation on a message scrolls to that message instead.
  // The callback ref apart, since React Compiler takes what holds a ref for one.
  const { content: stickContent, ...stick } = useStickToBottom(!focus)
  const composer = useRef<ComposerHandle>(null)
  const drop = useFileDrop(composer)
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
  const editing = messages.find((m) => m.rkey === editingRkey)
  const leaf = branch.at(-1)?.message
  // The reply composer stops a reply running at the end of the branch, in place of sending.
  const running = !editing && leaf?.record.status === 'pending' ? leaf.rkey : null
  const operations: ConversationOperations = {
    edit: setEditingRkey,
    quote: (text) => composer.current?.quote(text),
    running,
    regenerate: actions.regenerate,
    stop: actions.stop,
    models,
    storedIn:
      me.storageMode === 'space'
        ? "This chat's space on your PDS"
        : "This server's local storage, since your PDS doesn't support spaces yet",
  }
  const sent = (message: { replyRkey: string | null }) => {
    stick.pin()
    if (message.replyRkey) follow(message.replyRkey)
  }

  const blobUrl = blobUrlFor(`/api/conversations/${props.skey}`)

  return (
    // What a jump or Tab scrolls to stays clear of the sticky header and composer. Files dropped
    // anywhere on the conversation attach to the composer.
    <section
      ref={stickContent}
      {...drop}
      className="mx-auto flex w-full max-w-column flex-1 flex-col px-gutter *:scroll-mt-[calc(var(--spacing-bar)+--spacing(4))] *:scroll-mb-36"
    >
      <ConversationHeader
        skey={props.skey}
        title={title}
        instructions={info ? ((info.systemPrompt as string | undefined) ?? '') : undefined}
        outline={outlineOf(branch)}
        onRename={actions.rename}
        onSetInstructions={actions.setInstructions}
        onSync={actions.sync}
      />
      <ErrorAlert error={actions.error ?? loadError} />
      {waiting && <ConversationSkeleton />}
      {refreshed && messages.length === 0 && (
        <EmptyConversation onStart={(text) => composer.current?.fill(text)} />
      )}
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
            busy={actions.regenerating}
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
        editing={editing}
        ref={composer}
        above={<JumpToLatest stick={stick} />}
        onStop={running ? () => actions.stop(running) : undefined}
        onSent={sent}
        onEdited={(message) => {
          setEditingRkey(null)
          choose(message.rkey)
          sent(message)
        }}
        onCancelEdit={() => setEditingRkey(null)}
        waiting={waiting}
      />
    </section>
  )
}

interface JumpToLatestProps {
  stick: Following
}

/**
 * A button back down to the latest message, shown once the reader scrolls up: an arrow alone in a
 * small round card, floating centered just above the composer over its faded edge.
 */
function JumpToLatest(props: JumpToLatestProps) {
  // Read here rather than in the conversation, so scrolling past the edge rerenders only this.
  const atBottom = useAtBottom(props.stick)
  if (atBottom) return null
  return (
    <Button
      aria-label="Jump to latest message"
      title="Jump to latest message"
      onClick={props.stick.pin}
      className="absolute -top-3 left-1/2 size-8 -translate-x-1/2 rounded-full p-0 text-icon-quiet hover:text-ink focus-visible:text-ink"
    >
      <JumpDownIcon />
    </Button>
  )
}
