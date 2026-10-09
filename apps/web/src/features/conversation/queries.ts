import { queryOptions, experimental_streamedQuery as streamedQuery } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'
import { staleTime } from '../../shared/queries.ts'
import { conversationRefreshKey } from '../../store/react.tsx'
import { addEvent, FINISHED, noParts, replyEvents } from './lib/reply-stream.ts'

export const attachmentTypesQuery = queryOptions({
  queryKey: ['attachments', 'types'],
  staleTime,
  queryFn: () => read(api.blobs.attachments.types.$get()),
})

/** A reply's stream, reduced to its parts so far. A finished status refreshes the conversation. */
export const replyStreamQuery = (skey: string, rkey: string) =>
  queryOptions({
    queryKey: ['reply-stream', skey, rkey],
    queryFn: streamedQuery({
      streamFn: async function* ({ client, signal }) {
        const url = `/api/conversations/${skey}/messages/${rkey}/stream`
        for await (const event of replyEvents(url, signal)) {
          yield event
          if (event.type === 'status' && FINISHED.has(event.status))
            void client.invalidateQueries({ queryKey: conversationRefreshKey(skey) })
        }
      },
      reducer: addEvent,
      initialValue: noParts,
    }),
    // A stream runs once. Leaving the conversation drops it, and coming back follows again.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })
