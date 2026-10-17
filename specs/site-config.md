# Site Config

## Summary

A server's whole admin configuration can be exported as one JSON document and applied from one, so a tool like Ansible can set up a server and keep it as described. The document holds the admin settings, roles, plugin instances, and admin models. `site-config export` prints it, and `site-config apply` makes the server match it, removing anything it doesn't list. Both are commands run on the server, which call the running server through `GET` and `PUT /api/admin/config`, so a change takes effect at once, as it does from the admin area.

## Motivation

Every runtime setting lives in the app database and is edited in the admin area, which needs a person signed in with a browser. A deployment managed by Ansible, or any configuration management tool, needs to set up a fresh server without that person, and to bring an existing one back in line on every run. Those tools work by running commands over SSH and are built around stating what a server should look like, so they need a single document to apply that reports whether it changed anything.

Writing to the database from the command line isn't enough, because the running server holds the settings and the loaded plugins in memory and only reloads them when a change goes through it. Applying through the server also reuses the checks the admin area already makes, such as a plugin's options loading, and a model keeping its provider.

Installing plugin packages stays outside this, as everywhere else. A plugin is a dependency in the fork's `package.json`, and the deployment tool adds it, rebuilds, and restarts before applying a config that uses it.

## Design

### The document

```json
{
  "version": 1,
  "settings": {
    "general": { "appName": "SCN Chat", "description": "…" },
    "access": { "registration": "invite", "inviteRoles": ["scn-member"] },
    "sessions": { … },
    "turns": { … },
    "sync": { … }
  },
  "roles": [
    {
      "name": "scn-member",
      "description": "Active members of the Shared Computer Network.",
      "pdsHosts": [],
      "handleDomains": []
    },
    {
      "name": "staff",
      "description": "Can use the larger models.",
      "pdsHosts": [],
      "handleDomains": ["example.com"],
      "members": ["did:plc:abc123"]
    }
  ],
  "plugins": [
    {
      "id": "web-search",
      "package": "@scn-chat/plugin-web-search",
      "enabled": true,
      "options": { "engine": "tavily" },
      "secrets": { "tavilyApiKey": "tvly-…" }
    }
  ],
  "models": [
    {
      "provider": "anthropic",
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5",
      "capabilities": { "vision": true, "reasoning": true, "tools": true },
      "roles": ["user"],
      "default": true
    }
  ]
}
```

- **`version`** is 1. Any other version is refused, so a later format can't be misread.
- **`settings`** has the admin setting groups from [[admin-settings]], each in the shape its schema reads. A group left out keeps its stored value, with a warning, so a file written before an upgrade added a group still applies. A field left out of a group takes its default.
- **`roles`** are the roles besides the built-in `admin` and `user`, which always exist. A role's `members` is optional:
  - **Listed:** the role has exactly those members, including removing ones a plugin or an admin added.
  - **Left out:** the role's members are left alone. This is for roles a plugin keeps in sync, such as `scn-member` from [[scn-member-registry]], whose members would otherwise be removed on every apply until the next cron run.
  - `description`, `pdsHosts`, and `handleDomains` are optional too. One left out keeps its stored value, or starts empty for a new role.
  - `admin` may appear with only `members`, to set its hand-added admins. `ADMIN_DIDS` are admins whatever the document says.
- **`plugins`** are the plugin instances, in load order. An instance's `id` is chosen by the document. Instances added in the admin area are named after their plugin, as [[admin-plugins]] describes, so an export already has readable IDs such as `web-search`. Changing an instance's ID makes it a new instance, which doesn't keep the old one's secrets. `options` holds the plain options, and `secrets` the secret ones by field name. A secret left out of `secrets` keeps its stored value, and one set to `null` is cleared. A secret field given under `options` is stored as a secret. A package that isn't installed is stored as given, and loads once it is installed.
- **`models`** are the admin models, in the order users see them, in the shape `adminModelSchema` reads.

Every section must be present. An empty list or object is accepted and means none, but a missing section is refused, so a cut-off file can't wipe a server.

### Export

`GET /api/admin/config` answers with the document for the server as it is. Secrets are never included. Each plugin instead lists the secret fields that are set, as `"secretsSet": ["tavilyApiKey"]`, which apply accepts and ignores. Exporting and applying the result changes nothing, since every secret left out keeps its value.

- A plugin's options are exported as stored, including any its package no longer has, so applying the export changes nothing. Apply warns about those, so they can be removed from the file.
- A role with any member a plugin added, recorded as `plugin:<id>`, is exported without `members`, so applying the export leaves that role to its plugin.

### Apply

`PUT /api/admin/config` makes the server match the document, as a full reset. It refuses only what would stop the server starting or leave references it can't resolve. Anything a plugin can recover from, it stores and warns about, so a plugin changing its options in an upgrade doesn't fail a deploy. Someone fixes that plugin in the admin area afterwards.

1. **Read.** The body is checked against the document's schema, each setting against its own schema, and each model against `adminModelSchema`. A setting value its schema refuses is refused, since the server won't start with it stored.
2. **Check against itself.**
   - Plugin IDs are unique, and an installed package that allows one instance appears once.
   - No change to an instance's options renames its plugin, which would strand the user settings, tool switches, credentials, and models stored under the old plugin ID, and no two enabled instances make the same plugin. These match the admin area's checks.
   - Every role a model, `access.inviteRoles`, or a member list names is in the document or built in.
   - Every member is a DID.
   - No role being removed is held by an API key, since keys aren't part of the document.
3. **Compare.** When the server already matches, the apply ends here and answers `changed: false`, without rebuilding anything.
4. **Build.** When the plugins change, a plugin runtime is built from the document's instances. Plugins are only rebuilt when they change, so an apply that changes other things doesn't restart them.
5. **Write.** Settings, roles and members, instances, and models are written in one transaction, removing every role, instance, and model the document doesn't list. Then the new runtime replaces the old, and the settings store takes the new values, so they apply without a restart.

The whole apply holds the plugin holder's lock, so an apply and a change from the admin area never interleave. If anything is refused, nothing changes and the answer is a 400 with the issues, in the same shape as the admin area's errors, each pointing into the document, such as `plugins.1.id`.

The answer is `{ changed, changes, warnings }`. `changes` lists what was added, updated, and removed, such as `"plugin web-search updated"`, so the deployment tool can show it, and `changed` is false when the server already matched. `warnings` lists what was applied but needs a person's attention:

- A field the document's schema doesn't know, however deep, such as a misspelled nested setting. It is left out.
- A setting group the document leaves out. It keeps its stored value.
- An option or secret an installed plugin doesn't have. It is stored, and the plugin ignores it.
- An instance whose package changed, which drops the secrets it had, since another package's secrets mean nothing to it.
- A `secretsSet` that differs from the secrets that will be stored, since apply ignores it, and clearing a secret takes `null` under `secrets`.
- Options for a package that isn't installed, since its secret fields can't be told apart and anything under `options` is stored unencrypted.
- A plugin that isn't loaded, with why, such as its package not being installed or its options failing its schema.
- A model hidden from users because no loaded plugin serves its provider with an admin key.

The plugin and model warnings describe the server after the apply, so an apply that changes nothing still reports them.

Changes are recorded with the key that made them, as `api-key:<id>`, in the same columns that record an admin's DID.

### Access

Only API keys with the `admin` role reach `GET` and `PUT /api/admin/config`, through `requireApiKey` from [[api-keys]]. Like cron, the routes are registered before the session-guarded admin routes, and the cross-origin check skips them. A signed-in admin can't use them, and the rest of the admin API stays closed to keys, so a key can never issue other keys.

### The CLI

`apps/server/src/site-config-cli.ts`, with a root script `pnpm site-config`:

- `site-config export` prints the document to stdout.
- `site-config apply [file]` applies the document in the file, or from stdin when no file is given. It prints the changes, and the warnings to stderr, and exits 0 whether or not anything changed, or 1 with the issues when the apply is refused.
- It exits 2 with the usage when run wrong, before touching the database: an unknown command, `apply` with no file at a terminal, a `--url` that isn't a URL, or a SQLite `DATABASE_URL` naming a file that doesn't exist, which would otherwise be created empty.
- When the server refuses the CLI's key, the server at `--url` isn't using the CLI's database, and the CLI says so without printing `DATABASE_URL`, which can hold a password.

The CLI runs on the server, with the server's `.env` and database. Each run issues itself a single-use API key holding `admin`, labelled `site-config CLI`, calls the running server at `http://127.0.0.1:$PORT`, or at the address given with `--url`, and revokes the key when it's done. `--url` is for a server listening somewhere else, such as a local server that moved to the next free port because its own was taken. A run that is killed can leave its key behind, so each run first revokes any keys the CLI issued, recorded as created by `site-config CLI`, more than an hour old. A key an admin issues is never touched, whatever its label. The server must be running. The CLI doesn't change the database itself, apart from its key.

In the Docker deployment, a deployment tool runs it in the container, and pipes the document in so it needs no file inside the container:

```
docker compose exec -T scn-chat node apps/server/src/site-config-cli.ts export > site-config.json
docker compose exec -T scn-chat node apps/server/src/site-config-cli.ts apply < site-config.json
```

Calling `node` directly keeps pnpm's script banner out of the exported JSON.

### Documentation

- `CLAUDE.md`: the routes opened to API keys are cron and site config.
- `docs/deployment.md`: a section on exporting and applying the config, written by a maintainer.
- [[api-keys]]: the CLI issues and revokes its own single-use keys, an exception to keys being issued only in the admin area.

## Scope Boundaries

- No installing plugin packages. The deployment tool manages `package.json`, the build, and the restart.
- No people. Accounts, invites, suspensions, and API keys aren't in the document, apart from role members.
- No `.env` settings. The document holds only what the admin area edits.
- No partial apply. A document is the whole configuration, and a section can't be left out to keep it.
- No user settings, such as a user's own API keys or plugin settings.
- No secrets in the export.

## Edge Cases and Decisions

- **Full reset.** Anything the document doesn't list is removed, so the deployment's files are the record of how the server is set up. A change made in the admin area is undone by the next apply.
- **Optional members.** Leaving out `members` keeps them, so plugin-synced roles don't empty on every apply and leave members without their models until cron runs again.
- **Single-use keys rather than a key in `.env`.** Running the CLI needs shell access on the server, which already gives full control, so it needs no secret of its own, and no permanent key exists for anyone to leak.
- **Through the server rather than the database.** The server keeps settings and plugins in memory and reloads them only on its own changes, and it already holds the checks a change must pass.
- **Plugins are stored, not refused.** A plugin that fails to load, an option it doesn't have, or a package that isn't installed yet is stored with a warning, as the server treats them at startup. A deploy that upgrades a plugin whose options changed still succeeds, and the plugin shows as failed in the admin area until someone fixes it.
- **Refusals are kept for what can't be fixed in the admin area:** a setting value that stops the server starting, and references between roles, models, and members that don't resolve.
- **Defaults fill in what an entry leaves out**, such as a setting's unlisted fields and a plugin being enabled, so a hand-written document can stay short. A whole section can't be left out.
- **A refusal's issues point into the document**, such as `plugins.1.id`, so the CLI's message says where the problem is.
- **Unknown keys are warnings,** so a typo is visible in the deploy's output without failing it, and a field an upgrade removed doesn't either.
- **Removing a plugin instance** removes its stored options and secrets, as removing it in the admin area does.

## Acceptance Criteria

- [ ] Export answers with every section, and no secret values, only the names of the secrets that are set.
- [ ] Applying an exported document changes nothing and answers `changed: false`.
- [ ] Apply adds, updates, and removes plugin instances, models, and roles to match the document, in the document's order, and answers with the changes.
- [ ] Settings, plugins, and models changed by an apply take effect without a restart.
- [ ] A secret left out of `secrets` keeps its stored value, and one set to `null` is cleared.
- [ ] A role with `members` ends with exactly those members, and a role without `members` keeps its members.
- [ ] `ADMIN_DIDS` stay admins whatever the document says.
- [ ] A missing section, an unknown version, a setting value its schema refuses, a duplicate plugin ID, a second instance of a single-instance package, options that rename a plugin, two instances of the same plugin, an unknown role, a member that isn't a DID, or removing a role an API key holds refuses the apply, and nothing changes.
- [ ] An unknown field, an option a plugin doesn't have, a plugin that fails to load, a model whose provider isn't served, and a package change that drops secrets are applied, and each is reported in `warnings`.
- [ ] An option a plugin doesn't have is stored even when nothing else changes.
- [ ] A setting group the document leaves out keeps its stored value, with a warning.
- [ ] A plugin change made in the admin area while an apply runs reads the instances after the apply, so it doesn't undo it.
- [ ] A plugin whose package isn't installed is stored as given, and its export applies without changes.
- [ ] A secret field given under `options` is stored as a secret.
- [ ] The config routes accept an `admin` API key, refuse a web session, and need no `Origin` header.
- [ ] The CLI exports to stdout and applies from a file or stdin, through a single-use key it revokes afterwards, and revokes keys it issued more than an hour old, never an admin's.
- [ ] The CLI prints warnings and exits 0, and exits 1 with the issues when an apply is refused.
- [ ] `--url` sends the CLI's requests to the given address.
- [ ] The CLI exits 2 for a `--url` that isn't a URL, and for a SQLite database file that doesn't exist, without creating it.
- [ ] A `secretsSet` that differs from the stored secrets, and options for a package that isn't installed, are reported in `warnings`.

## Files

- `apps/server/src/admin/config-routes.ts`, `apps/server/src/admin/site-config.ts`
- `apps/server/src/site-config-cli.ts`
- `apps/server/src/app.ts`, `apps/server/src/auth/routes.ts`
- `apps/server/src/plugins/admin.ts`, `apps/server/src/settings/store.ts`, `apps/server/src/auth/role-store.ts`, `apps/server/src/providers/admin-models.ts`
- `package.json`, `apps/server/package.json`
- `CLAUDE.md`, `docs/deployment.md`, `specs/api-keys.md`
