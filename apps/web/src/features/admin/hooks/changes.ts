import { useQueryClient } from '@tanstack/react-query'
import { attachmentTypesQuery } from '../../conversation/queries.ts'
import { modelsQuery } from '../../models/queries.ts'
import { pluginSettingsQuery, providersQuery } from '../../settings/queries.ts'
import { adminModelsQuery, adminPluginsQuery } from '../queries.ts'

/**
 * Refresh what a plugin change can alter. Each change rebuilds the server's plugins, which decide
 * the admin models' warnings and, for this admin as a user, their models, providers, plugin
 * settings, and attachment types.
 */
export function usePluginsChanged() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [
        adminPluginsQuery,
        adminModelsQuery,
        modelsQuery,
        providersQuery,
        pluginSettingsQuery,
        attachmentTypesQuery,
      ].map(({ queryKey }) => queryClient.invalidateQueries({ queryKey })),
    )
}

/** Refresh the admin models, and the model list they add to for every user, this admin included. */
export function useModelsChanged() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      [adminModelsQuery, modelsQuery].map(({ queryKey }) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
}
