# Admin: settings

## Summary

The last public settings in `config.yml` move to the admin area: the app name, the web session lifetime, the turn limits and system prompt, and background sync. Each group is a zod schema in the server, stored in the settings store from [[admin]], and edited through a form generated from the schema, the same way plugin options are in [[admin-plugins]]. Changes apply without a restart. Settings the server needs before the database is open move to environment variables. `config.yml`, `config.example.yml`, and the `${NAME}` references are removed, and nothing reads the file any more.

## Motivation

Once roles, plugins, and models live in the database, the few settings left in `config.yml` would make it a second place to look. Dropping the file completes the rule that each setting lives in exactly one place: the environment for what the server needs to boot, and the database for everything an admin changes.

Deployment gets simpler too. A new server needs `.env` and nothing else, and the Docker setup no longer mounts a config file.

## Design

### Where each setting goes

| Old `config.yml` setting | Now | Why |
|---|---|---|
| `app.name` | `general.appName` | Admin setting |
| `app.publicUrl` | `PUBLIC_URL` | Part of the OAuth client ID, needed before anything else |
| `app.port` | `PORT` | Needed to listen |
| `app.dataDir` | `DATA_DIR` | Needed before the database opens |
| `app.logLevel` | `LOG_LEVEL` | The logger starts before the database |
| `app.allowPrivateNetworks` | `ALLOW_PRIVATE_NETWORKS` | Network policy of the deployment, fixed when the fetchers are built |
| `auth.scopeMode` | `OAUTH_SCOPE_MODE` | The OAuth client is built at startup |
| `auth.sessionTtlDays` | `sessions.ttlDays` | Admin setting |
| `auth.plcUrl` | `PLC_URL` | The identity resolver is built at startup |
| `turns.ratePerMinute`, `maxSteps`, `timeoutSeconds`, `backfillMinutes`, `systemPrompt` | `turns.*` | Admin settings |
| `sync.*` | `sync.*` | Admin settings |
| `roles` | Database | [[admin]] |
| `plugins`, `models` | Database | [[admin-plugins]] |

The environment variables that used to override admin settings, `APP_NAME`, `SESSION_TTL_DAYS`, `TURN_RATE_PER_MINUTE`, `TURN_MAX_STEPS`, `TURN_TIMEOUT_SECONDS`, and `TURN_BACKFILL_MINUTES`, are removed. So is `SCN_CHAT_CONFIG`, and the provider key variables in `.env.example`, since admin keys are now secret plugin options.

### Setting groups

Each group is a key in the settings store, with a zod schema in `apps/server/src/settings/schemas.ts`. Fields carry `.meta({ title, description })` for the generated form, and the defaults match today's.

| Key | Fields |
|---|---|
| `general` | `appName` (default `SCN Chat`) |
| `sessions` | `ttlDays` (1 or more, default 30) |
| `turns` | `ratePerMinute` (default 10), `maxSteps` (default 8), `timeoutSeconds` (default 600), `backfillMinutes` (default 60), `systemPrompt` (multi-line, default today's `DEFAULT_SYSTEM_PROMPT`, placeholders unchanged) |
| `sync` | `safetyNet` (`enabled`, `intervalMinutes`, `activeWithinHours`), `discovery` (`intervalMinutes`, `activeWithinDays`), `allowUserOptOut` |

### Applying changes

Consumers read the current value from the settings store when they need it, and never copy it at startup:

- **App name.** The HTML shell, the OAuth client metadata's `client_name`, the `{{appName}}` placeholder, and `ctx.app.name` all read it per use.
- **Session lifetime.** Applies to sessions created or extended after the change. Existing expiry times stay as they are.
- **Turns.** The rate limiter reads the rate on each check. A turn reads the step limit, timeout, and system prompt when it starts. The sync engine reads the backfill window per sync.
- **Sync.** The scheduler subscribes to `sync` and restarts its timers with the new intervals. `allowUserOptOut` is read per request.

### Environment

After this spec, `.env` holds everything outside the database:

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | |
| `DATABASE_URL` | `sqlite:./data/scn-chat.sqlite` | |
| `SECRET_KEY`, `SECRET_KEYS_OLD` | | Encryption, as today |
| `OAUTH_PRIVATE_KEYS` | | Required in production, as today |
| `ADMIN_DIDS` | | Required, from [[admin]] |
| `PUBLIC_URL` | `http://127.0.0.1:3000` | Must be HTTPS in production |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` | |
| `LOG_LEVEL` | `info` | |
| `ALLOW_PRIVATE_NETWORKS` | `false` | |
| `OAUTH_SCOPE_MODE` | `permission-set` | Production refuses `raw` |
| `PLC_URL` | `https://plc.directory` | |

`apps/server/src/config.ts` validates only the environment. `readConfigFile`, `interpolate`, and the `yaml` dependency are removed.

### Admin API and area

| Route | Purpose |
|---|---|
| `GET /api/admin/settings` | Every group, with its JSON schema and current value. |
| `PUT /api/admin/settings/:key` | Save one group. Failures return 400 with `{ error: 'InvalidRequest', issues }`. |

Three sections join the admin sidebar: **General**, with the app name and session lifetime, **Turns**, and **Sync**. Each renders its groups with `SchemaFields` and has one Save. The system prompt is a textarea, which `SchemaFields` renders for string fields marked `.meta({ multiline: true })`.

### Removing `config.yml`

- Delete `config.example.yml`, and remove `config.yml` from `.gitignore`, `.dockerignore`, `docker-compose.yml`, and the docs.
- Update `.env.example` with the variables above, grouped and commented.
- Update `CLAUDE.md`: the local setup, the fork notes that name `config.yml`, and the architecture decisions on admin configuration and the admin UI.
- Update the specs that describe `config.yml`: foundation, auth, plugins, providers, chat-storage, chat-turns, titles, web-search, and web-ui. Each points at the admin area or the environment instead.
- Update `docs/architecture.md`, `docs/plugins.md`, `docs/deployment.md`, the root `README.md`, and the web search README, whose example uses `config.yml`.

### Upgrading an existing server

There is no import. An existing server upgrades by:

1. Moving the settings in the environment table above from `config.yml` to `.env`, and adding `ADMIN_DIDS`.
2. Starting the new version and signing in as an admin.
3. Adding the plugin instances and models again, and setting access, roles, and the other settings.

Provider IDs appear in the model references stored in users' records, so each provider must be added back with the same ID it had, such as an OpenAI-compatible instance with `id: scn`. User settings and tool switches are keyed by plugin ID and are picked up again once the same plugins are added. `docs/deployment.md` describes these steps.

## Scope Boundaries

- No import of an existing `config.yml`.
- No settings export or import.
- No environment overrides for admin settings.
- No change to what the settings do, only where they live.

## Edge Cases and Decisions

- Every setting lives in either the environment or the database, never both, so nothing is silently ignored the way Open WebUI's persistent config is.
- `ALLOW_PRIVATE_NETWORKS` stays in the environment. It decides what the server's fetchers may reach, which is a property of the deployment, not something to change from a browser.
- Session lifetime changes don't touch existing sessions.

## Acceptance Criteria

- [ ] Every setting group reads as today's defaults on a fresh database.
- [ ] Saving a group with an invalid value returns 400 with the issues, and a valid save applies without a restart.
- [ ] A renamed app shows in the HTML shell, the OAuth client metadata, and the system prompt placeholder.
- [ ] A new session lifetime applies to new sessions and leaves existing expiry times alone.
- [ ] New turn limits and a new system prompt apply to the next turn.
- [ ] Changing sync intervals restarts the scheduler with them.
- [ ] The server starts with no `config.yml`.
- [ ] Startup fails with a message naming the variable for a missing `SECRET_KEY` or `ADMIN_DIDS`, a non-HTTPS `PUBLIC_URL` in production, or `OAUTH_SCOPE_MODE=raw` in production.
- [ ] Removed environment variables are no longer read.
- [ ] The General, Turns, and Sync sections save their settings, and the system prompt is a textarea.

## Files

- `apps/server/src/config.ts`, `apps/server/src/index.ts`, `apps/server/src/server.ts`
- `apps/server/src/settings/schemas.ts`, `apps/server/src/admin/routes.ts`
- `apps/server/src/auth/web-session.ts`, `apps/server/src/auth/oauth-client.ts`
- `apps/server/src/turns/runner.ts`, `apps/server/src/turns/prompt.ts`, `apps/server/src/sync/scheduler.ts`, `apps/server/src/sync/engine.ts`
- `apps/server/src/web-html.ts`
- `apps/web/src/pages/AdminPage.tsx`, `apps/web/src/components/SchemaFields.tsx`
- `.env.example`, `.gitignore`, `.dockerignore`, `docker-compose.yml`, `config.example.yml` (deleted)
- `CLAUDE.md`, `README.md`, `docs/`, `specs/`, `plugins/web-search/README.md`
