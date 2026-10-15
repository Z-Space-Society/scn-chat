import { useMutation } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { useRefreshConversation } from '../../../store/react.tsx'

/**
 * Rename, set the chat's instructions, and sync, each refreshing the conversation from the PDS once
 * it is done. Turns are the chat's, in `useChat`. `outcome` is how whichever ran last went, for the
 * conversation's one alert.
 */
export function useConversationActions(skey: string) {
  const refreshConversation = useRefreshConversation()
  const refresh = () => refreshConversation(skey)

  // Renaming and setting the instructions both change the conversation's info record.
  const patching = useMutation({
    mutationFn: (patch: { title: string } | { systemPrompt: string }) =>
      read(api.chats.conversations[':skey'].$patch({ param: { skey } }, json(patch))),
    onSuccess: refresh,
  })
  const syncing = useMutation({
    mutationFn: () => read(api.chats.conversations[':skey'].sync.$post({ param: { skey } })),
    onSuccess: refresh,
  })
  const last = syncing.submittedAt > patching.submittedAt ? syncing : patching
  // The mutations' own functions, which stay the same, so the actions do too, rather than changing
  // with every state either mutation passes through.
  const { mutateAsync: patch } = patching
  const { mutate: sync } = syncing

  return {
    rename: (title: string) => patch({ title }),
    setInstructions: (systemPrompt: string) => patch({ systemPrompt }),
    sync: () => sync(),
    outcome: { error: last.error, submittedAt: last.submittedAt },
  }
}
