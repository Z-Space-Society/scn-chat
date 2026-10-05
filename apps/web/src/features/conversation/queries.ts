import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'
import { staleTime } from '../../shared/queries.ts'

export const attachmentTypesQuery = queryOptions({
  queryKey: ['attachments', 'types'],
  staleTime,
  queryFn: () => read(api.blobs.attachments.types.$get()),
})
