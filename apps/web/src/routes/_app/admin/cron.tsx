import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CronAdmin } from '../../../features/admin/pages/CronAdmin.tsx'
import { adminCronQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/cron')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminCronQuery).then(noop, noop)]),
  component: CronAdmin,
})
