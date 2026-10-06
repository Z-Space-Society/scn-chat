import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'
import { staleTime } from '../../shared/queries.ts'

export const modelsQuery = queryOptions({
  queryKey: ['models'],
  staleTime,
  queryFn: () => read(api.providers.models.$get()),
})
