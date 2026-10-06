import { useQuery } from '@tanstack/react-query'
import { ClientOnly, Link } from '@tanstack/react-router'
import { messageOf } from '../../../shared/errors.ts'
import { adminCronQuery } from '../queries.ts'

const dayMs = 86_400_000

/** When cron last ran, and how to set it up. */
export function CronAdmin() {
  const cron = useQuery(adminCronQuery)
  const lastRun = cron.data
  return (
    <section>
      <h2>Cron</h2>
      {lastRun === null && (
        <p role="alert">
          Cron has never run. Plugins that work on a schedule, such as member lists, aren't being
          updated.
        </p>
      )}
      {lastRun && (
        <ClientOnly>
          {Date.now() - Date.parse(lastRun.startedAt) > dayMs && (
            <p role="alert">
              Cron hasn't run in over a day. Plugins that work on a schedule, such as member lists,
              aren't being updated.
            </p>
          )}
          <p>
            Last run started {new Date(lastRun.startedAt).toLocaleString()}
            {lastRun.finishedAt
              ? ` and finished ${new Date(lastRun.finishedAt).toLocaleString()}`
              : ' and is still going'}
            .{lastRun.failed.length > 0 && ` Failed: ${lastRun.failed.join(', ')}.`}
          </p>
        </ClientOnly>
      )}
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
      {cron.error && <p role="alert">{messageOf(cron.error)}</p>}
    </section>
  )
}
