import type { ModelRef } from '@scn-chat/lexicons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, json, read } from '../api.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { lastError } from '../lib/errors.ts'
import { inheritedModel, type ModelOption } from '../lib/models.ts'
import { messageText } from '../store/core.ts'
import { conversationRefreshKey, useConversation } from '../store/react.tsx'
import { Composer } from './Composer.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { MessageView } from './MessageView.tsx'
import { ModelSelect } from './ModelSelect.tsx'
import { ReplyStream } from './ReplyStream.tsx'
import { useBranch } from './useBranch.ts'
import { useModels } from './useModels.ts'
import { useReplyStream } from './useReplyStream.ts'
import { useStickToBottom } from './useStickToBottom.ts'

export function ConversationView({ skey }: { skey: string }) {
  const queryClient = useQueryClient()
  const { conversation, error: loadError } = useConversation(skey)
  // The user message being edited, by rkey, so the composer reads it from the conversation.
  const [editingRkey, setEditingRkey] = useState<string | null>(null)
  const { models } = useModels()

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
  /** Focus a message without scrolling to it, as when switching siblings. */
  const choose = (rkey: string) => {
    scrolledTo.current = rkey
    pick(rkey)
  }
  const focusShown = branch.some((step) => step.message.rkey === focus)
  useEffect(() => {
    if (!focus || !focusShown || scrolledTo.current === focus) return
    scrolledTo.current = focus
    document.getElementById(`m-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, focusShown])
  const leaf = branch.at(-1)?.message
  const editing = messages.find((m) => m.rkey === editingRkey)
  const editingParent = editing?.record.parent as string | undefined
  const blobUrl = blobUrlFor(`/api/conversations/${skey}`)
  const title = (conversation?.info?.title as string | undefined) ?? 'New chat'

  const regenerate = async (userRkey: string, model: ModelRef | null) => {
    const body = model ? { model } : {}
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

  const rename = async (title: string) => {
    await read(api.chats.conversations[':skey'].$patch({ param: { skey } }, json({ title })))
  }

  const renamingTitle = useMutation({ mutationFn: rename, onSuccess: refresh })
  const syncing = useMutation({ mutationFn: sync, onSuccess: refresh })
  const stopping = useMutation({ mutationFn: stop, onSuccess: refresh })
  const regenerating = useMutation({
    mutationFn: ({ parent, model }: { parent: string | null; model: ModelRef | null }) => {
      if (!parent) throw new Error('This reply has no user message to regenerate')
      return regenerate(parent, model)
    },
    onSuccess: refresh,
  })
  const error = lastError(renamingTitle, syncing, stopping, regenerating)

  return (
    <section className="conversation" ref={section}>
      <ConversationHeader
        skey={skey}
        title={title}
        onRename={(title, onSaved) => renamingTitle.mutate(title, { onSuccess: onSaved })}
        onSync={() => syncing.mutate()}
      />
      {(error ?? loadError) && <p role="alert">{error ?? loadError}</p>}
      {branch.map(({ message, siblings, index }) => {
        const record = message.record
        const parent = (record.parent as string | undefined) ?? null
        const actions =
          record.role === 'user' ? (
            <button type="button" onClick={() => setEditingRkey(message.rkey)}>
              Edit
            </button>
          ) : record.status === 'pending' ? (
            <button type="button" onClick={() => stopping.mutate(message.rkey)}>
              Stop
            </button>
          ) : (
            <RegenerateAction
              models={models}
              onRegenerate={(model) => regenerating.mutate({ parent, model })}
            />
          )
        return (
          <MessageView
            key={message.rkey}
            id={`m-${message.rkey}`}
            record={record}
            pending={<ReplyStream skey={skey} rkey={message.rkey} />}
            blobUrl={blobUrl}
            siblings={{
              index,
              count: siblings.length,
              onPick: (i) => choose((siblings[i] as { rkey: string }).rkey),
            }}
            actions={actions}
          />
        )
      })}
      {editing ? (
        <Composer
          // Editing another message starts the composer over from that message.
          key={`edit-${editing.rkey}`}
          skey={skey}
          parent={editingParent}
          inherited={inheritedModel(branch, editingParent)}
          initialText={messageText(editing.record)}
          onSent={(sent) => {
            pin()
            setEditingRkey(null)
            choose(sent.rkey)
            if (sent.replyRkey) follow(sent.replyRkey)
          }}
          onCancel={() => setEditingRkey(null)}
        />
      ) : (
        <Composer
          key="reply"
          skey={skey}
          parent={leaf?.rkey}
          inherited={inheritedModel(branch, leaf?.rkey)}
          onSent={(sent) => {
            pin()
            if (sent.replyRkey) follow(sent.replyRkey)
          }}
        />
      )}
    </section>
  )
}

/** Regenerate a reply with the same model, or with a model chosen for this reply. */
function RegenerateAction({
  models,
  onRegenerate,
}: {
  models: ModelOption[]
  onRegenerate: (model: ModelRef | null) => void
}) {
  const [model, setModel] = useState<ModelRef | null>(null)
  return (
    <>
      <ModelSelect aria-label="Regenerate with" models={models} value={model} onChange={setModel}>
        <option value="">Same model</option>
      </ModelSelect>
      <button type="button" onClick={() => onRegenerate(model)}>
        Regenerate
      </button>
    </>
  )
}
