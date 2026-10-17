import type { ModelRef } from '@scn-chat/lexicons'
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import { api, json, read } from '../../shared/api.ts'
import { isPending } from '../../shared/message.ts'
import { useConversation, useRefreshConversation } from '../../store/react.tsx'
import { useBranch } from './hooks/useBranch.ts'
import { useReplyFollower } from './reply-follower.ts'

/*
 * The open conversation as a chat: the branch on screen, and the turns that add to it. It looks
 * like the AI SDK's `useChat`, but holds no message list of its own. Messages come from the
 * browser's local copy, a reply streams as an overlay until its record arrives, the conversation
 * is a tree shown one branch at a time, and each reply has its own status, since another server or
 * client may be running it.
 */

/** A user message to send: its parts, the message it answers, and what it asks of its reply. */
export type OutgoingMessage = {
  parts: Record<string, unknown>[]
  parent?: string
  generation: { model?: ModelRef; effort?: string }
}

/** A message sent, by its key, with its reply's key when it asked for one. */
export type SentMessage = { rkey: string; replyRkey: string | null }

/** Post a user message to a conversation, which starts its reply on the server. */
const post = (skey: string, message: OutgoingMessage): Promise<SentMessage> =>
  read(api.turns.conversations[':skey'].messages.$post({ param: { skey } }, json(message)))

interface ChatOptions {
  /** After any turn starts, once its new message is on the branch, as to stick to the bottom. */
  onTurnStarted?: () => void
}

/**
 * The open conversation: what it shows, and sending, regenerating, and stopping. Every turn, from
 * a send, an edit, or a regeneration, follows its reply, puts its new message on the branch on
 * screen, then calls `onTurnStarted`.
 */
export function useChat(skey: string, options: ChatOptions = {}) {
  const { conversation, waiting, empty, error } = useConversation(skey)
  const messages = conversation?.messages ?? []
  const { follow } = useReplyFollower(skey, messages)
  const { focus, branch, pick } = useBranch(messages)
  const refresh = useRefreshConversation()

  /** A turn started: follow its reply and show its new message, the user's or the reply. */
  const started = (shown: string, replyRkey: string | null) => {
    if (replyRkey) follow(replyRkey)
    pick(shown)
    options.onTurnStarted?.()
  }

  const send = async (message: OutgoingMessage) => {
    const sent = await post(skey, message)
    started(sent.rkey, sent.replyRkey)
    // Refreshing picks up the sent message without waiting for the stream.
    void refresh(skey)
    return sent
  }
  const stopping = useMutation({
    mutationFn: async (replyRkey: string) => {
      const { cancelled } = await read(
        api.turns.conversations[':skey'].messages[':rkey'].cancel.$post({
          param: { skey, rkey: replyRkey },
        }),
      )
      if (!cancelled)
        throw new Error('This reply may already be finishing. Sync this chat to see it.')
    },
    onSuccess: () => refresh(skey),
  })
  const regenerating = useMutation({
    mutationFn: async (draft: { parent: string | null; model: ModelRef | null }) => {
      if (!draft.parent)
        throw new Error("Couldn't regenerate this reply. Sync this chat, then try again.")
      const result = await read(
        api.turns.conversations[':skey'].messages[':rkey'].regenerate.$post(
          { param: { skey, rkey: draft.parent } },
          json(draft.model ? { model: draft.model } : {}),
        ),
      )
      if (!result.replyRkey)
        throw new Error("Couldn't regenerate this reply. Sync this chat, then try again.")
      return result.replyRkey
    },
    onSuccess: (replyRkey) => {
      started(replyRkey, replyRkey)
      return refresh(skey)
    },
  })
  // The stable functions alone, so what calls them stays the same from render to render.
  const { mutate: stop } = stopping
  const { mutate: regenerate } = regenerating
  const leaf = branch.at(-1)?.message
  // The later of the two, so a later success clears an earlier failure.
  const outcome = [stopping, regenerating].reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a))

  return {
    /** The conversation's info record, or null until it arrives. */
    info: conversation?.info ?? null,
    messages,
    /** Whether the local copy has answered, with the messages it holds, if any. */
    loaded: conversation !== null,
    /** The branch on screen, from the root to its newest reply. */
    branch,
    /** The message the URL focuses, which the branch passes through. */
    focus,
    /** Show a message's branch, as switching siblings does, leaving the scroll where it is. */
    pick,
    waiting,
    empty,
    /** Why the conversation couldn't be read, if it couldn't. */
    loadError: error,
    /** The reply running at the end of the branch, by key, if one is. */
    running: leaf && isPending(leaf.record) ? leaf.rkey : null,
    send,
    /** Ask again for the reply to a user message, by its key, with a model or the same one. */
    regenerate: (parent: string | null, model: ModelRef | null) => regenerate({ parent, model }),
    regenerating: regenerating.isPending,
    stop: (replyRkey: string) => stop(replyRkey),
    /** How the last regeneration or stop went, for the conversation's one alert. */
    outcome: { error: outcome.error, submittedAt: outcome.submittedAt },
  }
}

/**
 * A chat not yet created, whose first message creates it. A failed send that created the chat
 * reuses it on the next try, so trying again never leaves an empty chat behind.
 */
export function useStartChat() {
  const created = useRef<string | null>(null)
  return async (message: OutgoingMessage): Promise<SentMessage & { skey: string }> => {
    if (created.current === null)
      created.current = (await read(api.chats.conversations.$post())).skey
    const skey = created.current
    // The chat opens next, which reads it from the PDS, so there is nothing to refresh yet.
    return { ...(await post(skey, message)), skey }
  }
}
