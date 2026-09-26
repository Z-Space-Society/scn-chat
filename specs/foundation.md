# Foundation

## Summary

The foundation is the empty but working skeleton every later spec builds on. It sets up a pnpm workspace with three packages: generated TypeScript for our lexicons, a Hono server, and a Vite React web app. It adds environment config, a Kysely database layer that runs on SQLite or Postgres, a migration runner, and a test setup that exercises both databases. When it is done, `pnpm dev` starts the server and web app, the web page shows the server's health, and `pnpm test` passes on both databases. No chat features exist yet.

## Motivation

Every phase 1 spec needs the same plumbing: config, a database, a server, a web app, and tests. Settling it once keeps later specs about features rather than setup. The foundation also locks in the rules that are painful to retrofit: all lexicon NSIDs come from one generated module, all branding comes from config, the database code stays portable across SQLite and Postgres, and the atproto alpha packages install reproducibly.

## Design

### Workspace layout

```
package.json            root scripts, pnpm overrides, packageManager, engines
pnpm-workspace.yaml     packages/*, apps/*, plugins/*
tsconfig.base.json      shared strict compiler options
vitest.config.ts        one Vitest run across all packages
.nvmrc                  24
.env.example            every variable, with safe development defaults
lexicons/               lexicon JSON (exists today)
packages/lexicons/      @scn-chat/lexicons: generated schemas and types
apps/server/            @scn-chat/server: Hono API server
apps/web/               @scn-chat/web: Vite React app
```

All packages are ESM (`"type": "module"`) with TypeScript `strict` on. Workspace packages export their TypeScript source directly (`"exports": "./src/index.ts"`), so nothing needs a build step.

The server runs TypeScript natively with Node's built-in type stripping, in development and production, with no compile step and no runner like tsx. That requires Node 22.18 or newer, and the project targets Node 24, the current LTS. The shared tsconfig sets `erasableSyntaxOnly`, `verbatimModuleSyntax`, and `allowImportingTsExtensions`, so the compiler rejects syntax Node cannot strip, such as enums and namespaces. Relative imports use `.ts` extensions. `tsc --noEmit` does type checking. Vite handles TypeScript for the web app.

The plugin API package and the `plugins/` directory are created by the plugins spec.

### atproto alpha packages

Every `@atproto/*` package with an alpha release is pinned to one exact alpha version through `pnpm.overrides` in the root `package.json`. A range like `^0.0.0-spaces-alpha-*` also matches the broken `0.0.0` releases, so ranges are never used. The lockfile is committed. Upgrading the alpha means changing one version string for every override at once.

### Lexicon package

`packages/lexicons` holds TypeScript generated from `lexicons/` by the `lex build` command from `@atproto/lex`, the same tool bulletin uses. Its schemas come from `@atproto/lex-schema`. The package's index is the one module the rest of the code uses for NSIDs, record types, and record validation. No other code writes an NSID as a string.

- `pnpm codegen` regenerates it with `--clear`, `--index-file`, and `--import-ext .ts`.
- The generated files are committed, so reviewers see schema changes in diffs and nothing needs generating after a clone.
- Upstream lexicons that later specs need, such as `com.atproto.space.*`, are vendored into `lexicons/upstream/` when that spec needs them, with a note recording the source commit, as bulletin does.

### Config

`apps/server/src/config.ts` parses `process.env` with a zod schema once at startup and exports a typed, frozen config object. An invalid or missing required value stops the server with a message naming the variable. `.env` is loaded with Node's built-in `process.loadEnvFile` when the file exists.

| Variable | Default in `.env.example` | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `3000` | Server port |
| `PUBLIC_URL` | `http://127.0.0.1:3000` | Public base URL of the app |
| `APP_NAME` | `SCN Chat` | Display name, used by the web app |
| `DATA_DIR` | `./data` | Directory for local files such as the SQLite database and blobs |
| `DATABASE_URL` | `sqlite:./data/scn-chat.sqlite` | `sqlite:<path>` or `postgres://...` |
| `LOG_LEVEL` | `info` | pino log level |

Later specs add their own variables to the same schema and to `.env.example`.

### Database

`apps/server/src/db/` creates a Kysely instance from `DATABASE_URL`:

- `sqlite:` uses `better-sqlite3` with `SqliteDialect`, with WAL mode and foreign keys turned on.
- `postgres://` uses `pg` with `PostgresDialect`.

The database types live in one `Database` interface that later specs extend.

Migrations are TypeScript files in `apps/server/src/db/migrations/`, registered in an explicit ordered map and run by Kysely's `Migrator`. The server runs pending migrations on startup, and `pnpm migrate` runs them on their own. The foundation ships the runner with no tables. Each later spec adds its own migrations.

Migrations and queries stay within what both databases support. Timestamps are ISO 8601 text. JSON, including stored lexicon records, is text. Any dialect-specific SQL has to live behind a helper with a test on both databases.

### Server

`apps/server` uses `hono` with `@hono/node-server`. `createApp(deps)` builds the Hono app from a config and a database, so tests can create an app without opening a port. The entry point creates the config, database, and logger, runs migrations, and starts listening.

- `GET /api/health` returns `{ "status": "ok", "appName": "..." }` after a trivial database query succeeds. It returns 503 with `{ "status": "error" }` when the query fails, and logs the error.
- Every route under `/api` is private to our web app. None of it is a public API.
- In production the server also serves the built web app from `apps/web/dist`, with an `index.html` fallback for client-side routes. In development Vite serves the web app and proxies `/api` to the server.
- Logging uses pino, with request logging through a small Hono middleware.

### Web app

`apps/web` is a Vite React app with no router, state library, or CSS framework. The single `App` component fetches `/api/health` and shows the app name and whether the server is reachable. There is no styling beyond browser defaults.

### Tests

Vitest runs every package from the root config. Tests live in a `tests/` directory in each package that mirrors its `src/`.

- Database tests run against both SQLite and Postgres through a shared helper. SQLite uses an in-memory `better-sqlite3` database. Postgres uses PGlite, an in-process build of Postgres, through `kysely-pglite-dialect`, so no Docker or database server is needed.
- Web tests use jsdom and Testing Library.
- The lexicon package has tests that every lexicon document validates against the alpha lexicon schema, and that the generated code is current with the JSON.

### Scripts

| Root script | Does |
|---|---|
| `pnpm dev` | Runs the server with `node --watch` and the Vite dev server together |
| `pnpm build` | Builds the web app |
| `pnpm start` | Runs the server in production mode, serving the built web app |
| `pnpm test` | Runs all tests once |
| `pnpm typecheck` | Type checks every package |
| `pnpm lint` | Lints and checks formatting with Biome |
| `pnpm format` | Formats with Biome |
| `pnpm check` | Runs lint, typecheck, and test, for any CI system |
| `pnpm codegen` | Regenerates the lexicon package |
| `pnpm migrate` | Runs pending migrations |

### Linting and continuous integration

Biome handles both linting and formatting, configured in one `biome.json` at the root. No CI configuration is committed, so the project is not tied to one host. Any CI system runs `pnpm install --frozen-lockfile` and then `pnpm check`.

## Scope Boundaries

- No authentication, sessions, or OAuth. That is the auth spec.
- No database tables. Each later spec adds its own.
- No plugin interfaces or plugin package. That is the plugins spec.
- No atproto network calls and no vendored upstream lexicons yet.
- No Docker image or deployment setup.
- No CI configuration for any particular host.
- No UI beyond the health status page.

## Edge Cases and Decisions

- The server runs TypeScript through Node's native type stripping instead of compiling to JavaScript. If the generated lexicon code turns out to use syntax Node cannot strip, the fallback is running the server through `tsx`.
- Node refuses to strip types for files under `node_modules`. Workspace packages work because pnpm symlinks them there and Node resolves symlinks to their real paths by default. Never run with `--preserve-symlinks`.
- SQLite uses `better-sqlite3`, not Node's built-in `node:sqlite`, because Kysely's SQLite dialect targets the `better-sqlite3` API. It ships prebuilt binaries for common platforms.
- Generated lexicon code is committed, with a test that fails when it is stale.
- Migrations run on server startup. Kysely's migrator takes a lock, so several instances starting together on Postgres do not run a migration twice.
- Timestamps and JSON are stored as text on both databases, trading Postgres-native types for portability. Search and other features that need native types add them behind dialect helpers.

## Acceptance Criteria

- [ ] `pnpm install` on a clean clone succeeds with the committed lockfile, and resolves no `@atproto/*` package to a plain `0.0.0` release.
- [ ] Config parsing returns typed values for a valid environment, and fails with the variable's name when a required value is missing or invalid.
- [ ] `DATABASE_URL` with `sqlite:` produces a working SQLite database, and with `postgres://` produces a working Postgres database.
- [ ] An unsupported `DATABASE_URL` scheme fails at startup with a clear message.
- [ ] The migrator applies pending migrations in order on both databases, and running it again applies nothing.
- [ ] `GET /api/health` returns 200 with the app name when the database is reachable.
- [ ] `GET /api/health` returns 503 when the database query fails.
- [ ] In production mode, the server serves the built web app and falls back to `index.html` for unknown non-API paths. Unknown `/api` paths return 404.
- [ ] The web app renders the app name and the server's health status, and shows an unreachable state when the health request fails.
- [ ] Every lexicon document validates against the alpha lexicon schema.
- [ ] The generated lexicon code matches a fresh `pnpm codegen` run.
- [ ] `pnpm check` passes on a clean clone.

## Files

- (to be populated during implementation)
