import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'
import { staleTime } from '../../shared/queries.ts'

/**
 * Which files the composer can attach. Apart from the conversation's other queries, which bring
 * the store's hooks, so the chat routes' loader can start it without them in the app's entry.
 */
export const attachmentTypesQuery = queryOptions({
  queryKey: ['attachments', 'types'],
  staleTime,
  queryFn: () => read(api.blobs.attachments.types.$get()),
})
