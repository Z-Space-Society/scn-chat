# Cron

## Summary

`POST /api/cron` runs every plugin's `cron` hook. Something outside the server calls it on a schedule the admin chooses, such as a crontab line with `curl`, using an API key from [[api-keys]] that holds `admin`. The admin area shows when cron last ran and warns when it hasn't.

## Motivation

Plugins need to do work on a schedule, such as refetching a member list from [[scn-member-registry]]. Each plugin running its own timer hides the schedule from the admin and spreads it across plugins. A single cron route, like Drupal's, puts the schedule in the admin's hands and gives plugins one place to hang periodic work.

## Design

### The route

`POST /api/cron`, opened to API keys with `requireApiKey('admin')`.

- **Running.** Core runs the `cron` action hook of the current plugin runtime, like any action hook: in hook order, with a handler that throws logged and skipped. The payload is `{ startedAt }`. A plugin that wants a different cadence keeps track of its own last run.
- **Overlap.** A call while a run is going is a 409 `{ error: 'CronRunning' }`, and starts nothing.
- **Answer.** The route answers when the run finishes, with `{ startedAt, finishedAt, failed }`, where `failed` lists the plugin IDs whose handler threw. A run with failures is still a 200.
- **Time limit.** A run waits at most 10 minutes. The handler still running then, and any not reached, are listed in `failed` and logged, and the run ends, so a hung plugin doesn't block every later run.

### The hook

```ts
type ActionHooks = {
  cron: { startedAt: string }
  // …
}
```

### Last run

```
cron_run (id integer primary key check (id = 1), started_at text, finished_at text null, failed_json text)
```

One row, replaced at the start and end of each run.

### Admin area

**Cron** (`/admin/cron`): when the last run started and finished and which plugins failed, a warning when cron has never run or last ran more than a day ago, and setup instructions: issue a key with the `admin` role on the API keys page, then add a line like

```
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer <key>" https://chat.example.com/api/cron
```

`GET /api/admin/cron` returns the last run.

### Documentation

- `docs/plugins.md` documents the `cron` hook.
- `docs/deployment.md` explains setting up cron.

## Scope Boundaries

- No scheduler in the server. Without an outside caller, cron never runs.
- No per-plugin schedules or intervals in core.
- No "Run now" button in the admin area.

## Edge Cases and Decisions

- Every handler runs on every call. The admin's crontab sets the cadence for all of them.
- A run that hits the time limit doesn't cancel its handlers, since action hooks take no signal. A hung handler may still be running when the next run starts.

## Acceptance Criteria

- [ ] A call with an `admin` key runs every plugin's `cron` hook and records the run.
- [ ] A call while a run is going is a 409 and runs nothing.
- [ ] A handler that throws is logged and listed in `failed`, and the others still run.
- [ ] A run ends after 10 minutes, listing the handler still running and any not reached in `failed`.
- [ ] The Cron page warns when cron has never run or last ran more than a day ago.

## Files

- `apps/server/src/cron.ts`
- `apps/server/src/app.ts`, `apps/server/src/admin/routes.ts`
- `apps/server/src/db/migrations/`
- `packages/plugin-api/src/index.ts`
- `apps/web/src/pages/AdminPage.tsx`
- `docs/plugins.md`, `docs/deployment.md`
