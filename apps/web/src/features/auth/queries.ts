import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => read(api.auth.me.$get()),
})
