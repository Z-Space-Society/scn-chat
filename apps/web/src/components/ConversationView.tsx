import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearch } from 'wouter'
import { api, json, read } from '../api.ts'
import { blobUrlFor } from '../lib/blob-url.ts'
import { useMe } from '../session.tsx'
import { messageText } from '../store/core.ts'
import { useConversation, useStore } from '../store/react.tsx'
import { Composer, type ModelOption, modelKey } from './Composer.tsx'
import { MessageView } from './MessageView.tsx'
import { ShareControl } from './ShareControl.tsx'
import { useAction } from './useAction.ts'
import { useBranch } from './useBranch.ts'
import { useReplyStream } from './useReplyStream.ts'
import { useStickToBottom } from './useStickToBottom.ts'

export function ConversationView({
  skey,
  models,
  noModels,
}: {
  skey: string
  models: ModelOption[]
  noModels?: boolean
}) {
  const me = useMe()
  const store = useStore()
  const { conversation, error: loadError } = useConversation(skey)
  const { error, run } = useAction()
  const [editing, setEditing] = useState<{ parent?: string; text: string } | null>(null)
  const [regenModel, setRegenModel] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)

  const messages = conversation?.messages ?? []
  const refresh = useCallback(() => store.worker.refreshConversation(skey), [store, skey])
  const isPending = useCallback(
    (rkey: string) => messages.find((m) => m.rkey === rkey)?.record.status === 'pending',
    [messages],
  )
  const { streams, follow } = useReplyStream(skey, refresh, isPending)

  useEffect(() => {
    for (const message of messages) if (message.record.status === 'pending') follow(message.rkey)
  }, [messages, follow])

  const focus = new URLSearchParams(useSearch()).get('m')
  const section = useRef<HTMLElement>(null)
  // A link to a message scrolls to that message instead.
  const { pin } = useStickToBottom(section, !focus)
  const { branch, pick } = useBranch(messages, focus)
  const scrolledTo = useRef<string | null>(null)
  const focusShown = branch.some((step) => step.message.rkey === focus)
  useEffect(() => {
    if (!focus || !focusShown || scrolledTo.current === focus) return
    scrolledTo.current = focus
    document.getElementById(`m-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, focusShown])
  const leaf = branch.at(-1)?.message
  const blobUrl = blobUrlFor(`/api/conversations/${skey}`)
  const title = (conversation?.info?.title as string | undefined) ?? 'New chat'

  const regenerate = async (userRkey: string) => {
    const model = models.find((m) => modelKey(m) === regenModel)
    const body = model ? { model: { provider: model.provider, id: model.id } } : {}
    const result = await read(
      api.turns.conversations[':skey'].messages[':rkey'].regenerate.$post(
        { param: { skey, rkey: userRkey } },
        json(body),
      ),
    )
    if (!result.replyRkey) throw new Error(`Regenerating was ${result.status}`)
    pick(userRkey, result.replyRkey)
    follow(result.replyRkey)
    await refresh()
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
    await refresh()
  }

  const rename = async (value: string) => {
    await read(api.chats.conversations[':skey'].$patch({ param: { skey } }, json({ title: value })))
    setRenaming(null)
    await refresh()
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
              run(() => rename(renaming))
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
        <button type="button" onClick={() => run(sync)}>
          Sync
        </button>
        {me.storageMode === 'space' && <ShareControl skey={skey} ownerDid={me.did} />}
      </header>
      {(error ?? loadError) && <p role="alert">{error ?? loadError}</p>}
      {branch.map(({ message, siblings, index, parent: group }) => {
        const record = message.record
        const parent = (record.parent as string | undefined) ?? null
        const actions =
          record.role === 'user' ? (
            <button
              type="button"
              onClick={() => setEditing({ parent: parent ?? undefined, text: messageText(record) })}
            >
              Edit
            </button>
          ) : record.status === 'pending' ? (
            <button type="button" onClick={() => run(() => stop(message.rkey))}>
              Stop
            </button>
          ) : (
            <>
              <select
                aria-label="Regenerate with"
                value={regenModel}
                onChange={(e) => setRegenModel(e.target.value)}
              >
                <option value="">Same model</option>
                {models.map((m) => (
                  <option key={modelKey(m)} value={modelKey(m)}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  run(() => {
                    if (!parent) throw new Error('This reply has no user message to regenerate')
                    return regenerate(parent)
                  })
                }
              >
                Regenerate
              </button>
            </>
          )
        return (
          <MessageView
            key={message.rkey}
            id={`m-${message.rkey}`}
            record={record}
            streaming={streams[message.rkey]}
            blobUrl={blobUrl}
            siblings={{
              index,
              count: siblings.length,
              onPick: (i) => pick(group, (siblings[i] as { rkey: string }).rkey),
            }}
            actions={actions}
          />
        )
      })}
      {editing ? (
        <Composer
          key="edit"
          skey={skey}
          parent={editing.parent}
          models={models}
          noModels={noModels}
          initialText={editing.text}
          onSent={(sent) => {
            pin()
            setEditing(null)
            pick(editing.parent ?? null, sent.rkey)
            if (sent.replyRkey) follow(sent.replyRkey)
            run(refresh)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Composer
          key="reply"
          skey={skey}
          parent={leaf?.rkey}
          models={models}
          noModels={noModels}
          onSent={(sent) => {
            pin()
            if (sent.replyRkey) follow(sent.replyRkey)
            run(refresh)
          }}
        />
      )}
    </section>
  )
}
