import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, read } from './api.ts'

/** Server data, keyed by the route it comes from. Writes invalidate the keys they change. */

/**
 * How long settings-like data stays fresh. Without it, each component refetches when it mounts:
 * right after a loader or the server render fetched the same data, and in every conversation opened.
 */
const staleTime = 60_000

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => read(api.auth.me.$get()),
})

export const modelsQuery = queryOptions({
  queryKey: ['models'],
  staleTime,
  queryFn: () => read(api.providers.models.$get()),
})

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

export const attachmentTypesQuery = queryOptions({
  queryKey: ['attachments', 'types'],
  staleTime,
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

/** Accounts for the admin's users list, 50 a page, matching the search `q`. */
export const adminUsersQuery = (q: string) =>
  infiniteQueryOptions({
    queryKey: ['admin', 'users', q],
    staleTime,
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      read(api.admin.users.$get({ query: { q, ...(pageParam && { cursor: pageParam }) } })),
    getNextPageParam: (page) => page.cursor ?? undefined,
  })

export const adminInvitesQuery = queryOptions({
  queryKey: ['admin', 'invites'],
  staleTime,
  queryFn: async () => (await read(api.admin.invites.$get())).invites,
})

export const adminRolesQuery = queryOptions({
  queryKey: ['admin', 'roles'],
  staleTime,
  queryFn: () => read(api.admin.roles.$get()),
})

export const adminAccessQuery = queryOptions({
  queryKey: ['admin', 'access'],
  staleTime,
  queryFn: () => read(api.admin.access.$get()),
})

export const adminPluginsQuery = queryOptions({
  queryKey: ['admin', 'plugins'],
  staleTime,
  queryFn: async () => (await read(api.admin.plugins.$get())).instances,
})

export const adminInstalledQuery = queryOptions({
  queryKey: ['admin', 'plugins', 'installed'],
  staleTime,
  queryFn: async () => (await read(api.admin.plugins.installed.$get())).plugins,
})

export const adminModelsQuery = queryOptions({
  queryKey: ['admin', 'models'],
  staleTime,
  queryFn: async () => (await read(api.admin.models.$get())).models,
})

export const adminSettingsQuery = queryOptions({
  queryKey: ['admin', 'settings'],
  staleTime,
  queryFn: async () => (await read(api.admin.settings.$get())).settings,
})
