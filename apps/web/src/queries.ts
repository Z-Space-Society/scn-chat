import { queryOptions } from '@tanstack/react-query'
import { api, read } from './api.ts'

/** Server data, keyed by the route it comes from. Writes invalidate the keys they change. */

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => read(api.auth.me.$get()),
})

export const modelsQuery = queryOptions({
  queryKey: ['models'],
  queryFn: () => read(api.providers.models.$get()),
})

export const preferencesQuery = queryOptions({
  queryKey: ['preferences'],
  queryFn: async () =>
    ((await read(api.chats.preferences.$get())).preferences ?? null) as Record<
      string,
      unknown
    > | null,
})

export const providersQuery = queryOptions({
  queryKey: ['providers'],
  queryFn: async () => (await read(api.providers.providers.$get())).providers,
})

export const credentialsQuery = queryOptions({
  queryKey: ['credentials'],
  queryFn: async () => (await read(api.providers.credentials.$get())).credentials,
})

export const pluginSettingsQuery = queryOptions({
  queryKey: ['plugins', 'settings'],
  queryFn: async () => (await read(api.plugins.settings.$get())).plugins,
})

export const accountQuery = queryOptions({
  queryKey: ['account'],
  queryFn: () => read(api.chats.account.$get()),
})

export const attachmentTypesQuery = queryOptions({
  queryKey: ['attachments', 'types'],
  queryFn: () => read(api.blobs.attachments.types.$get()),
})

export const sharingQuery = (skey: string) =>
  queryOptions({
    queryKey: ['sharing', skey],
    queryFn: () => read(api.sharing.conversations[':skey'].sharing.$get({ param: { skey } })),
  })

export const sharedQuery = (ownerDid: string, skey: string) =>
  queryOptions({
    queryKey: ['shared', ownerDid, skey],
    queryFn: () =>
      read(api.sharing.shared[':ownerDid'][':skey'].$get({ param: { ownerDid, skey } })),
  })
