import { useSuspenseQuery } from '@tanstack/react-query'
import { ClientOnly, Link } from '@tanstack/react-router'
import { LocalTime } from '../../../shared/LocalTime.tsx'
import { adminCronQuery } from '../queries.ts'

const dayMs = 86_400_000

/** When cron last ran, and how to set it up. */
export function CronAdmin() {
  const { data: lastRun } = useSuspenseQuery(adminCronQuery)
  return (
    <section>
      <h2>Cron</h2>
      <LastRun run={lastRun} />
      <p>
        Issue a key with the <code>admin</code> role on the{' '}
        <Link to="/admin/api-keys">API keys</Link> page, then call cron on a schedule, for example
        from a crontab:
      </p>
      <ClientOnly>
        <pre>
          {`*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer <key>" ${window.location.origin}/api/cron`}
        </pre>
      </ClientOnly>
    </section>
  )
}

interface LastRunProps {
  run: { startedAt: string; finishedAt: string | null; failed: string[] } | null
}

/** How the last run went, warning when cron has never run or hasn't run in a day. */
function LastRun(props: LastRunProps) {
  if (!props.run)
    return (
      <p role="alert">
        Cron has never run. Plugins that work on a schedule, such as member lists, aren't being
        updated.
      </p>
    )
  return (
    <>
      <ClientOnly>
        {Date.now() - Date.parse(props.run.startedAt) > dayMs && (
          <p role="alert">
            Cron hasn't run in over a day. Plugins that work on a schedule, such as member lists,
            aren't being updated.
          </p>
        )}
      </ClientOnly>
      <p>
        Last run started <LocalTime date={props.run.startedAt} />
        <FinishedAt date={props.run.finishedAt} />.
        {props.run.failed.length > 0 && ` Failed: ${props.run.failed.join(', ')}.`}
      </p>
    </>
  )
}

interface FinishedAtProps {
  date: string | null
}

function FinishedAt(props: FinishedAtProps) {
  if (!props.date) return ' and is still going'
  return (
    <>
      {' '}
      and finished <LocalTime date={props.date} />
    </>
  )
}
