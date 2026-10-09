import type { ModelRef } from '@scn-chat/lexicons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { lastError } from '../../../shared/errors.ts'
import { conversationRefreshKey } from '../../../store/react.tsx'

/**
 * Rename, sync, stop a reply, and regenerate one, each refreshing the conversation from the PDS
 * once it is done. `error` is the error of whichever ran last, for the conversation's one alert.
 */
export function useConversationActions(skey: string, onRegenerated: (replyRkey: string) => void) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationRefreshKey(skey) })

  const renaming = useMutation({
    mutationFn: (title: string) =>
      read(api.chats.conversations[':skey'].$patch({ param: { skey } }, json({ title }))),
    onSuccess: refresh,
  })
  const syncing = useMutation({
    mutationFn: () => read(api.chats.conversations[':skey'].sync.$post({ param: { skey } })),
    onSuccess: refresh,
  })
  const stopping = useMutation({
    mutationFn: async (replyRkey: string) => {
      const { cancelled } = await read(
        api.turns.conversations[':skey'].messages[':rkey'].cancel.$post({
          param: { skey, rkey: replyRkey },
        }),
      )
      if (!cancelled)
        throw new Error('This reply is not running on this server, so it cannot be stopped')
    },
    onSuccess: refresh,
  })
  const regenerating = useMutation({
    mutationFn: async (draft: { parent: string | null; model: ModelRef | null }) => {
      if (!draft.parent) throw new Error('This reply has no user message to regenerate')
      const result = await read(
        api.turns.conversations[':skey'].messages[':rkey'].regenerate.$post(
          { param: { skey, rkey: draft.parent } },
          json(draft.model ? { model: draft.model } : {}),
        ),
      )
      if (!result.replyRkey) throw new Error(`Regenerating was ${result.status}`)
      return result.replyRkey
    },
    onSuccess: (replyRkey) => {
      onRegenerated(replyRkey)
      return refresh()
    },
  })

  return {
    rename: (title: string) => renaming.mutateAsync(title),
    sync: () => syncing.mutate(),
    stop: (replyRkey: string) => stopping.mutate(replyRkey),
    regenerate: (parent: string | null, model: ModelRef | null) =>
      regenerating.mutate({ parent, model }),
    error: lastError(renaming, syncing, stopping, regenerating),
  }
}
