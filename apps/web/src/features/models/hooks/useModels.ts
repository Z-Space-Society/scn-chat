import type { ModelRef } from '@scn-chat/lexicons'
import { useQuery } from '@tanstack/react-query'
import { messageOf } from '../../../shared/errors.ts'
import { preferencesQuery } from '../../settings/queries.ts'
import { fallbackModel } from '../models.ts'
import { modelsQuery } from '../queries.ts'

/** The models on offer, and the fallback model for a turn whose branch inherits `inherited`. */
export function useModels(inherited: ModelRef | null = null) {
  const catalog = useQuery(modelsQuery)
  const preferences = useQuery(preferencesQuery)
  return {
    models: catalog.data?.models ?? [],
    /** The catalog loaded and offers the user no models at all. */
    noModels: catalog.data?.models.length === 0,
    fallback: fallbackModel(inherited, preferences.data, catalog.data),
    error: catalog.error ? `Could not load models: ${messageOf(catalog.error)}` : null,
  }
}
