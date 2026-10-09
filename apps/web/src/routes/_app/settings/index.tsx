import { createFileRoute } from '@tanstack/react-router'
import { modelsQuery } from '../../../features/models/queries.ts'
import { PreferencesSettings } from '../../../features/settings/pages/PreferencesSettings.tsx'
import { preferencesQuery } from '../../../features/settings/queries.ts'

export const Route = createFileRoute('/_app/settings/')({
  // The models are optional: a failure to load them shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(preferencesQuery),
      context.queryClient.prefetchQuery(modelsQuery),
    ]),
  component: PreferencesSettings,
})
