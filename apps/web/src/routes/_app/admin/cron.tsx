import { createFileRoute } from '@tanstack/react-router'
import { CronAdmin } from '../../../features/admin/pages/CronAdmin.tsx'
import { adminCronQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/cron')({
  loader: ({ context }) => context.queryClient.query(adminCronQuery),
  component: CronAdmin,
})
