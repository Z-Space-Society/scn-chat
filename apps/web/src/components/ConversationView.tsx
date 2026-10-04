import { useMutation, useQueryClient } from '@tanstack/react-query'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { api, json, read } from '../api.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import type { BranchMessage } from '../lib/branch.ts'
import { lastError } from '../lib/errors.ts'
import { inheritedModel, type ModelOption, modelRef } from '../lib/models.ts'
import { useMe } from '../session.tsx'
import { messageText } from '../store/core.ts'
import { conversationRefreshKey, useConversation } from '../store/react.tsx'
import { Composer } from './Composer.tsx'
import { MessageView, type MessageViewProps } from './MessageView.tsx'
import { ModelSelect } from './ModelSelect.tsx'
import { ReplyStream } from './ReplyStream.tsx'
import { ShareControl } from './ShareControl.tsx'
import { useBranch } from './useBranch.ts'
import { useModels } from './useModels.ts'
import { useReplyStream } from './useReplyStream.ts'
import { useStickToBottom } from './useStickToBottom.ts'

/** A message open in the composer for editing, which sends its edit under the same parent. */
type Editing = { rkey: string; parent?: string; text: string }

export function ConversationView({ skey }: { skey: string }) {
  const me = useMe()
  const queryClient = useQueryClient()
  const { conversation, error: loadError } = useConversation(skey)
  const [editing, setEditing] = useState<Editing | null>(null)
  const { models } = useModels()
  const [regenModel, setRegenModel] = useState<ModelOption | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  const messages = conversation?.messages ?? []
  /** Refresh the conversation from the PDS after a change to it. */
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationRefreshKey(skey) })
  const pending = messages.filter((m) => m.record.status === 'pending').map((m) => m.rkey)
  const { follow } = useReplyStream(skey, pending)

  const { focus, branch, pick } = useBranch(messages)
  const section = useRef<HTMLElement>(null)
  // Opening the conversation on a message scrolls to that message instead.
  const { pin } = useStickToBottom(section, !focus)
  const scrolledTo = useRef<string | null>(null)
  /**
   * Focus a message without scrolling to it, as when switching siblings. A callback, since every
   * message takes it, and React Compiler leaves a function that writes a ref unmemoized.
   */
  const choose = useCallback(
    (rkey: string) => {
      scrolledTo.current = rkey
      pick(rkey)
    },
    [pick],
  )
  const focusShown = branch.some((step) => step.message.rkey === focus)
  useEffect(() => {
    if (!focus || !focusShown || scrolledTo.current === focus) return
    scrolledTo.current = focus
    document.getElementById(`m-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, focusShown])
  const leaf = branch.at(-1)?.message
  // Worked out here rather than in the composer's props, so React Compiler can skip rerendering it.
  const inherited = inheritedModel(branch, editing ? editing.parent : leaf?.rkey)
  const blobUrl = blobUrlFor(`/api/conversations/${skey}`)
  const title = (conversation?.info?.title as string | undefined) ?? 'New chat'

  const regenerate = async (userRkey: string) => {
    const body = regenModel ? { model: modelRef(regenModel) } : {}
    const result = await read(
      api.turns.conversations[':skey'].messages[':rkey'].regenerate.$post(
        { param: { skey, rkey: userRkey } },
        json(body),
      ),
    )
    if (!result.replyRkey) throw new Error(`Regenerating was ${result.status}`)
    choose(result.replyRkey)
    follow(result.replyRkey)
  }

  const stop = async (replyRkey: string) => {
    const { cancelled } = await read(
      api.turns.conversations[':skey'].messages[':rkey'].cancel.$post({
        param: { skey, rkey: replyRkey },
      }),
    )
    if (!cancelled)
      throw new Error('This reply is not running on this server, so it cannot be stopped')
  }

  const sync = async () => {
    await read(api.chats.conversations[':skey'].sync.$post({ param: { skey } }))
  }

  const rename = async (value: string) => {
    await read(api.chats.conversations[':skey'].$patch({ param: { skey } }, json({ title: value })))
    setRenaming(null)
  }

  const renamingTitle = useMutation({ mutationFn: rename, onSuccess: refresh })
  const syncing = useMutation({ mutationFn: sync, onSuccess: refresh })
  const stopping = useMutation({ mutationFn: stop, onSuccess: refresh })
  const regenerating = useMutation({
    mutationFn: (parent: string | null) => {
      if (!parent) throw new Error('This reply has no user message to regenerate')
      return regenerate(parent)
    },
    onSuccess: refresh,
  })
  const error = lastError(renamingTitle, syncing, stopping, regenerating)
  const operations: Operations = {
    models,
    regenModel,
    setRegenModel,
    choose,
    edit: setEditing,
    stop: stopping.mutate,
    regenerate: regenerating.mutate,
  }

  return (
    <section className="conversation" ref={section}>
      <header>
        {renaming === null ? (
          <h2>
            {title}{' '}
            <button type="button" onClick={() => setRenaming(title)}>
              Rename
            </button>
          </h2>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              renamingTitle.mutate(renaming)
            }}
          >
            <input
              aria-label="Title"
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
            />
            <button type="submit">Save</button>
          </form>
        )}
        <button type="button" onClick={() => syncing.mutate()}>
          Sync
        </button>
        {me.storageMode === 'space' && <ShareControl skey={skey} ownerDid={me.did} />}
      </header>
      {(error ?? loadError) && <p role="alert">{error ?? loadError}</p>}
      {branch.map(({ message, siblings, index }) => (
        <ConversationMessage
          key={message.rkey}
          skey={skey}
          message={message}
          index={index}
          count={siblings.length}
          previous={siblings[index - 1]?.rkey}
          next={siblings[index + 1]?.rkey}
          blobUrl={blobUrl}
          operations={operations}
        />
      ))}
      {editing ? (
        <Composer
          // Editing another message starts the composer over from that message.
          key={`edit-${editing.rkey}`}
          skey={skey}
          parent={editing.parent}
          inherited={inherited}
          initialText={editing.text}
          onSent={(sent) => {
            pin()
            setEditing(null)
            choose(sent.rkey)
            if (sent.replyRkey) follow(sent.replyRkey)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Composer
          key="reply"
          skey={skey}
          parent={leaf?.rkey}
          inherited={inherited}
          onSent={(sent) => {
            pin()
            if (sent.replyRkey) follow(sent.replyRkey)
          }}
        />
      )}
    </section>
  )
}

/** What a message's actions can do, the same for every message on the branch. */
type Operations = {
  models: ModelOption[]
  regenModel: ModelOption | null
  setRegenModel: (model: ModelOption | null) => void
  choose: (rkey: string) => void
  edit: (editing: Editing) => void
  stop: (rkey: string) => void
  regenerate: (parent: string | null) => void
}

/**
 * One message on the branch, with its actions and its stream while pending. Memoized, since React
 * Compiler doesn't memoize the items of a list, so a change to the conversation rerenders only the
 * messages it changed. Its siblings come as the neighbors' rkeys, which stay equal across renders
 * where the sibling list itself would not.
 */
const ConversationMessage = memo(function ConversationMessage({
  skey,
  message,
  index,
  count,
  previous,
  next,
  blobUrl,
  operations,
}: {
  skey: string
  message: BranchMessage
  index: number
  count: number
  previous?: string
  next?: string
  blobUrl: MessageViewProps['blobUrl']
  operations: Operations
}) {
  const record = message.record
  const parent = (record.parent as string | undefined) ?? null
  const actions =
    record.role === 'user' ? (
      <button
        type="button"
        onClick={() =>
          operations.edit({
            rkey: message.rkey,
            parent: parent ?? undefined,
            text: messageText(record),
          })
        }
      >
        Edit
      </button>
    ) : record.status === 'pending' ? (
      <button type="button" onClick={() => operations.stop(message.rkey)}>
        Stop
      </button>
    ) : (
      <>
        <ModelSelect
          aria-label="Regenerate with"
          models={operations.models}
          value={operations.regenModel}
          onChange={operations.setRegenModel}
        >
          <option value="">Same model</option>
        </ModelSelect>
        <button type="button" onClick={() => operations.regenerate(parent)}>
          Regenerate
        </button>
      </>
    )
  return (
    <MessageView
      id={`m-${message.rkey}`}
      record={record}
      pending={<ReplyStream skey={skey} rkey={message.rkey} />}
      blobUrl={blobUrl}
      siblings={{
        index,
        count,
        // The picker only ever steps to a neighbor.
        onPick: (i) => operations.choose((i < index ? previous : next) as string),
      }}
      actions={actions}
    />
  )
})
