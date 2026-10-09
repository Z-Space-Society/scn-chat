import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'
import { staleTime } from '../../shared/queries.ts'

/** The key every users search falls under. */
export const adminUsersKey = ['admin', 'users'] as const

/** Accounts for the admin's users list, 50 a page, matching the search `q`. */
export const adminUsersQuery = (q: string) =>
  infiniteQueryOptions({
    queryKey: [...adminUsersKey, q],
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

const fetchAdminRoles = () => read(api.admin.roles.$get())

/** A role, with its matching rules and explicit members. */
export type AdminRole = Awaited<ReturnType<typeof fetchAdminRoles>>['roles'][number]

export const adminRolesQuery = queryOptions({
  queryKey: ['admin', 'roles'],
  staleTime,
  queryFn: fetchAdminRoles,
})

export const adminAccessQuery = queryOptions({
  queryKey: ['admin', 'access'],
  staleTime,
  queryFn: () => read(api.admin.access.$get()),
})

const fetchAdminPlugins = async () => (await read(api.admin.plugins.$get())).instances

/** A configured plugin, with its options, status, and the providers it adds. */
export type AdminPlugin = Awaited<ReturnType<typeof fetchAdminPlugins>>[number]

export const adminPluginsQuery = queryOptions({
  queryKey: ['admin', 'plugins'],
  staleTime,
  queryFn: fetchAdminPlugins,
})

export const adminInstalledQuery = queryOptions({
  queryKey: ['admin', 'plugins', 'installed'],
  staleTime,
  queryFn: async () => (await read(api.admin.plugins.installed.$get())).plugins,
})

const fetchAdminModels = async () => (await read(api.admin.models.$get())).models

/** A model the admin offers, with the server's warning about it, if any. */
export type AdminModelEntry = Awaited<ReturnType<typeof fetchAdminModels>>[number]

export const adminModelsQuery = queryOptions({
  queryKey: ['admin', 'models'],
  staleTime,
  queryFn: fetchAdminModels,
})

export const adminSettingsQuery = queryOptions({
  queryKey: ['admin', 'settings'],
  staleTime,
  queryFn: async () => (await read(api.admin.settings.$get())).settings,
})

export const adminApiKeysQuery = queryOptions({
  queryKey: ['admin', 'api-keys'],
  staleTime,
  queryFn: async () => (await read(api.admin['api-keys'].$get())).keys,
})

export const adminCronQuery = queryOptions({
  queryKey: ['admin', 'cron'],
  staleTime,
  queryFn: async () => (await read(api.admin.cron.$get())).lastRun,
})
