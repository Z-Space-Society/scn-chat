import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'
import { staleTime } from '../../shared/queries.ts'

export const preferencesQuery = queryOptions({
  queryKey: ['preferences'],
  staleTime,
  queryFn: async () =>
    ((await read(api.chats.preferences.$get())).preferences ?? null) as Record<
      string,
      unknown
    > | null,
})

export const providersQuery = queryOptions({
  queryKey: ['providers'],
  staleTime,
  queryFn: async () => (await read(api.providers.providers.$get())).providers,
})

export const credentialsQuery = queryOptions({
  queryKey: ['credentials'],
  staleTime,
  queryFn: async () => (await read(api.providers.credentials.$get())).credentials,
})

export const pluginSettingsQuery = queryOptions({
  queryKey: ['plugins', 'settings'],
  staleTime,
  queryFn: async () => (await read(api.plugins.settings.$get())).plugins,
})

export const accountQuery = queryOptions({
  queryKey: ['account'],
  staleTime,
  queryFn: () => read(api.chats.account.$get()),
})
