import type { authApiRoutes } from './auth/routes.ts'
import type { blobRoutes } from './blobs/routes.ts'
import type { pluginRoutes } from './plugins/routes.ts'
import type { providerRoutes } from './providers/routes.ts'
import type { sharingRoutes } from './sharing/routes.ts'
import type { storageRoutes } from './storage/routes.ts'
import type { turnRoutes } from './turns/routes.ts'

/** Route types for the api client, mounted under /api, with plugins under /api/plugins. */
export type AuthApi = ReturnType<typeof authApiRoutes>
export type StorageApi = ReturnType<typeof storageRoutes>
export type TurnsApi = ReturnType<typeof turnRoutes>
export type ProvidersApi = ReturnType<typeof providerRoutes>
export type PluginsApi = ReturnType<typeof pluginRoutes>
export type BlobsApi = ReturnType<typeof blobRoutes>
export type SharingApi = ReturnType<typeof sharingRoutes>
