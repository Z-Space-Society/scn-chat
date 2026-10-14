import { useQueryClient } from '@tanstack/react-query'
import { modelsQuery } from '../../models/queries.ts'
import { credentialsQuery } from '../queries.ts'

/** Refresh the keys, and the models, since keys decide which of the user's own models are offered. */
export function useKeysChanged() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: credentialsQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: modelsQuery.queryKey }),
    ])
}
