import { createFileRoute } from '@tanstack/react-router'
import { PreferencesSettings } from '../../../pages/SettingsPage.tsx'
import { modelsQuery, preferencesQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/settings/')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(preferencesQuery),
      context.queryClient.prefetchQuery(modelsQuery),
    ]),
  component: PreferencesSettings,
})
