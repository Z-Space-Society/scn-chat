import type { ModelRef } from '@scn-chat/lexicons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { lastError } from '../../../shared/errors.ts'
import { messageText } from '../../../store/core.ts'
import { conversationRefreshKey, useConversation } from '../../../store/react.tsx'
import { ModelSelect } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import type { ModelOption } from '../../models/models.ts'
import { useBranch } from '../hooks/useBranch.ts'
import { useReplyStream } from '../hooks/useReplyStream.ts'
import { useStickToBottom } from '../hooks/useStickToBottom.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { type BranchMessage, inheritedModel } from '../lib/branch.ts'
import { Composer } from './Composer.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { MessageView } from './MessageView.tsx'
import { ReplyStream } from './ReplyStream.tsx'

interface ConversationViewProps {
  skey: string
}

export function ConversationView(props: ConversationViewProps) {
  const queryClient = useQueryClient()
  const { conversation, error: loadError } = useConversation(props.skey)
  // The user message being edited, by rkey, so the composer reads it from the conversation.
  const [editingRkey, setEditingRkey] = useState<string | null>(null)
  const { models } = useModels()

  const messages = conversation?.messages ?? []
  /** Refresh the conversation from the PDS after a change to it. */
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: conversationRefreshKey(props.skey) })
  const pending = messages.filter((m) => m.record.status === 'pending').map((m) => m.rkey)
  const { follow } = useReplyStream(props.skey, pending)

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
  const blobUrl = blobUrlFor(`/api/conversations/${props.skey}`)
  const title = (conversation?.info?.title as string | undefined) ?? 'New chat'

  const regenerate = async (userRkey: string, model: ModelRef | null) => {
    const body = model ? { model } : {}
    const result = await read(
      api.turns.conversations[':skey'].messages[':rkey'].regenerate.$post(
        { param: { skey: props.skey, rkey: userRkey } },
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
        param: { skey: props.skey, rkey: replyRkey },
      }),
    )
    if (!cancelled)
      throw new Error('This reply is not running on this server, so it cannot be stopped')
  }

  const sync = async () => {
    await read(api.chats.conversations[':skey'].sync.$post({ param: { skey: props.skey } }))
  }

  const rename = async (title: string) => {
    await read(
      api.chats.conversations[':skey'].$patch({ param: { skey: props.skey } }, json({ title })),
    )
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

  /** Edit a user message, stop a pending reply, or regenerate a finished one. */
  const actionsFor = (message: BranchMessage) => {
    const record = message.record
    if (record.role === 'user')
      return (
        <button type="button" onClick={() => setEditingRkey(message.rkey)}>
          Edit
        </button>
      )
    if (record.status === 'pending')
      return (
        <button type="button" onClick={() => stopping.mutate(message.rkey)}>
          Stop
        </button>
      )
    const parent = (record.parent as string | undefined) ?? null
    return (
      <RegenerateAction
        models={models}
        onRegenerate={(model) => regenerating.mutate({ parent, model })}
      />
    )
  }

  return (
    <section className="conversation" ref={section}>
      <ConversationHeader
        skey={props.skey}
        title={title}
        onRename={(title, onSaved) => renamingTitle.mutate(title, { onSuccess: onSaved })}
        onSync={() => syncing.mutate()}
      />
      {(error ?? loadError) && <p role="alert">{error ?? loadError}</p>}
      {branch.map(({ message, siblings, index }) => (
        <MessageView
          key={message.rkey}
          id={`m-${message.rkey}`}
          record={message.record}
          pending={<ReplyStream skey={props.skey} rkey={message.rkey} />}
          blobUrl={blobUrl}
          siblings={{
            index,
            count: siblings.length,
            onPick: (i) => choose((siblings[i] as { rkey: string }).rkey),
          }}
          actions={actionsFor(message)}
        />
      ))}
      {editing ? (
        <Composer
          // Editing another message starts the composer over from that message.
          key={`edit-${editing.rkey}`}
          skey={props.skey}
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
          skey={props.skey}
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

interface RegenerateActionProps {
  models: ModelOption[]
  onRegenerate: (model: ModelRef | null) => void
}

/** Regenerate a reply with the same model, or with a model chosen for this reply. */
function RegenerateAction(props: RegenerateActionProps) {
  const [model, setModel] = useState<ModelRef | null>(null)
  return (
    <>
      <ModelSelect
        aria-label="Regenerate with"
        models={props.models}
        value={model}
        onChange={setModel}
      >
        <option value="">Same model</option>
      </ModelSelect>
      <button type="button" onClick={() => props.onRegenerate(model)}>
        Regenerate
      </button>
    </>
  )
}
