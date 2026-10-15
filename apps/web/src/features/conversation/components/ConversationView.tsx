import { createContext, useContext, useRef, useState } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { JumpDownIcon, RetryIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { useDocumentTitle } from '../../../shared/useDocumentTitle.ts'
import { useMe } from '../../auth/session.ts'
import { useModels } from '../../models/hooks/useModels.ts'
import { useChat } from '../chat.ts'
import { useConversationActions } from '../hooks/useConversationActions.ts'
import { useFileDrop } from '../hooks/useFileDrop.ts'
import { type Following, useAtBottom, useStickToBottom } from '../hooks/useStickToBottom.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { outlineOf } from '../lib/outline.ts'
import { BranchComposer } from './BranchComposer.tsx'
import { BranchView } from './BranchView.tsx'
import type { ComposerHandle } from './Composer.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { ConversationSkeleton } from './ConversationSkeleton.tsx'
import { EmptyConversation } from './EmptyConversation.tsx'
import { LiveAuthor } from './LiveAuthor.tsx'
import { type ConversationOperations, MessageActions, RunningReply } from './message-actions.tsx'
import { ReplyStream } from './ReplyStream.tsx'

interface Props {
  skey: string
}

/** A conversation: its header, the branch on screen with replies streaming in, and the composer. */
export function ConversationView(props: Props) {
  // Every turn ends at the bottom of the branch, so the view follows it there.
  const chat = useChat(props.skey, { onTurnStarted: () => stick.pin() })
  // While another tab holds the local copy, the banner over the page says why it is waiting.
  const { info, messages, branch, waiting, running } = chat
  // Its functions apart from `chat`, which changes with every update. React Compiler keeps a
  // callback that calls `chat.regenerate(...)` on all of `chat`, so the callbacks every message gets
  // would change with it and render every message again. The rest are taken out alike.
  const { regenerate, regenerating, stop, pick, send } = chat
  const me = useMe()
  const { models } = useModels()
  const actions = useConversationActions(props.skey)
  // The user message being edited, by rkey, so the composer reads it from the conversation.
  const [editingRkey, setEditingRkey] = useState<string | null>(null)
  // Every chat has an info record from its creation, so until it arrives, from the local copy or
  // the PDS, the chat's title and instructions are unknown rather than empty.
  const title = waiting && !info ? undefined : ((info?.title as string | undefined) ?? 'New chat')
  useDocumentTitle(title)
  // The messages there when the chat first loaded, which show at once. Only later ones fade in.
  const [opened, setOpened] = useState<Set<string> | null>(null)
  if (opened === null && chat.loaded) setOpened(new Set(messages.map((m) => m.rkey)))

  // Opening the conversation on a message scrolls to that message instead.
  // The callback ref apart, since React Compiler takes what holds a ref for one.
  const { content: stickContent, ...stick } = useStickToBottom(!chat.focus)
  const composer = useRef<ComposerHandle>(null)
  const drop = useFileDrop(composer)
  const editing = messages.find((m) => m.rkey === editingRkey)
  // The reply composer stops a reply running at the end of the branch, in place of sending.
  const stoppable = editing ? null : running
  const operations: ConversationOperations = {
    edit: setEditingRkey,
    quote: (text) => composer.current?.quote(text),
    regenerate,
    stop,
    models,
    storedIn:
      me.storageMode === 'space'
        ? "This chat's space on your PDS"
        : "This server's local storage, since your PDS doesn't support spaces yet",
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
      <ErrorAlert error={lastError(actions.outcome, chat.outcome) ?? chat.loadError} />
      {waiting && <ConversationSkeleton />}
      {chat.empty && <EmptyConversation onStart={(text) => composer.current?.fill(text)} />}
      <RunningReply.Provider value={stoppable}>
        <Regenerating.Provider value={regenerating}>
          <BranchView
            branch={branch}
            blobUrl={blobUrl}
            onPick={pick}
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
              <TryAgain
                onClick={() =>
                  regenerate((message.record.parent as string | undefined) ?? null, null)
                }
              />
            )}
            arrived={(message) => !opened?.has(message.rkey)}
          />
        </Regenerating.Provider>
      </RunningReply.Provider>
      <BranchComposer
        branch={branch}
        editing={editing}
        ref={composer}
        above={<JumpToLatest stick={stick} />}
        send={send}
        onStop={stoppable ? () => stop(stoppable) : undefined}
        onEdited={() => setEditingRkey(null)}
        onCancelEdit={() => setEditingRkey(null)}
        waiting={waiting}
      />
    </section>
  )
}

/**
 * Whether a regeneration is on its way, for the Try again buttons. A context, apart from the
 * callback every message gets, so starting or ending one rerenders only those buttons.
 */
const Regenerating = createContext(false)

interface TryAgainProps {
  onClick: () => void
}

/** A failed reply's Try again, busy while a regeneration is on its way. */
function TryAgain(props: TryAgainProps) {
  const busy = useContext(Regenerating)
  return (
    <Button size="small" className="mt-2.5" busy={busy} onClick={props.onClick}>
      <RetryIcon className="size-3.75 text-muted" />
      Try again
    </Button>
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
