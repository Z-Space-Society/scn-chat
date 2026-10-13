import { useSuspenseQuery } from '@tanstack/react-query'
import { ClientOnly, Link } from '@tanstack/react-router'
import { timeAgo } from '../../../shared/time.ts'
import { Badge, Chips } from '../../../shared/ui/Badge.tsx'
import { Secret } from '../../../shared/ui/Secret.tsx'
import {
  Callout,
  SettingRow,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { adminCronQuery, type CronRun } from '../queries.ts'

const dayMs = 86_400_000

/** When cron last ran, and how to set it up. */
export function CronAdmin() {
  const { data: lastRun } = useSuspenseQuery(adminCronQuery)
  return (
    <SettingsPage
      title="Cron"
      description="Plugins that work on a schedule, such as member lists, run when cron is called."
    >
      <LastRun run={lastRun} />
      <SettingsGroup title="Set up">
        <ol className="list-decimal py-card-pad ps-10.5 pe-card-pad text-ui *:ps-0.5 [&>li+li]:mt-3">
          <li>
            Issue a key with the <code>admin</code> role on the{' '}
            <Link to="/admin/api-keys">API keys</Link> page.
          </li>
          <li>
            Call cron on a schedule, for example every five minutes from a crontab:
            <ClientOnly>
              <CronLine />
            </ClientOnly>
          </li>
        </ol>
      </SettingsGroup>
    </SettingsPage>
  )
}

/** The crontab line for this server, which only the browser knows the address of. */
function CronLine() {
  return (
    <Secret
      text={`*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer <key>" ${window.location.origin}/api/cron`}
    />
  )
}

const notUpdated = "Plugins that work on a schedule, such as member lists, aren't being updated."

interface LastRunProps {
  /** The last run, or null when cron has never run. */
  run: CronRun | null
}

/** How the last run went, warning when cron has never run or hasn't in over a day. */
function LastRun(props: LastRunProps) {
  if (!props.run)
    return (
      <Callout tone="danger">
        <p role="alert">Cron has never run. {notUpdated}</p>
      </Callout>
    )
  const run = props.run
  return (
    // Times are in the browser's locale and time zone, which the server rendering the page lacks.
    <ClientOnly>
      {Date.now() - Date.parse(run.startedAt) > dayMs && (
        <Callout tone="danger">
          <p role="alert">Cron hasn't run in over a day. {notUpdated}</p>
        </Callout>
      )}
      <SettingsGroup title="Last run">
        <RunSummary run={run} />
        {run.failed.length > 0 && (
          <SettingRow
            label="Failed"
            description="Plugins whose job threw or ran out of time. See the server log for details."
          >
            <Chips values={run.failed} />
          </SettingRow>
        )}
      </SettingsGroup>
    </ClientOnly>
  )
}

interface RunProps {
  run: CronRun
}

/** When the run started, as how long ago, and how long it took, with how it went. */
function RunSummary(props: RunProps) {
  const run = props.run
  const started = new Date(run.startedAt)
  const ago = timeAgo(started)
  const when = started.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const took = run.finishedAt
    ? `took ${duration(Date.parse(run.finishedAt) - started.getTime())}`
    : 'is still going'
  return (
    <SettingRow
      label={
        <time dateTime={run.startedAt} title={started.toLocaleString()}>
          {ago.charAt(0).toUpperCase() + ago.slice(1)}
        </time>
      }
      description={`Started ${when} and ${took}.`}
    >
      <RunStatus run={run} />
    </SettingRow>
  )
}

/** How a run went, as a badge: still going, how many plugins failed, or that it succeeded. */
function RunStatus(props: RunProps) {
  if (!props.run.finishedAt) return <Badge tone="good">Still going</Badge>
  if (props.run.failed.length) return <Badge tone="danger">{props.run.failed.length} failed</Badge>
  return <Badge tone="good">Succeeded</Badge>
}

/** A run's length in whole seconds, or minutes once it passes one. */
function duration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}
