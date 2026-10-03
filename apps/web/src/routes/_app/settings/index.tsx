import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PreferencesSettings } from '../../../pages/SettingsPage.tsx'
import { modelsQuery, preferencesQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/settings/')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(preferencesQuery).then(noop, noop),
      context.queryClient.query(modelsQuery).then(noop, noop),
    ]),
  component: PreferencesSettings,
})
