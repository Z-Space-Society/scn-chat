import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => read(api.auth.me.$get()),
})

/** The signed-in user's public profile, read from their PDS through the server. */
export const profileQuery = queryOptions({
  queryKey: ['me', 'profile'],
  queryFn: () => read(api.auth.me.profile.$get()),
  staleTime: 5 * 60_000,
})
