# Admin: plugins and models

## Summary

Admins add, configure, reorder, disable, and remove plugins in the admin area, and manage the models everyone can use with the admin's keys. The plugins an admin can choose from are the ones installed with the server, listed as dependencies in the root `package.json`. Each configured plugin is a plugin instance stored in the database, with its options validated against the plugin's `optionsSchema` and its secret options encrypted. The admin form for an instance is generated from that same schema, so most plugins need nothing new to get one. A saved change takes effect without a restart: the server builds a new plugin runtime from the new settings, switches new turns over to it, and lets turns already running finish on the old one.

This builds on [[admin]] and replaces the `plugins` and `models` sections of `config.yml`. [[admin-settings]] covers the remaining settings.

## Motivation

An admin shouldn't need a shell and a restart to add a search engine, rotate a provider key, or offer a new model. Plugins already describe their options with zod schemas, and the web app already turns zod schemas with JSON Forms rules into user settings forms, so the admin forms come almost for free.

Installing plugin packages from the web UI would let anyone who takes over an admin account run arbitrary code on the server, so installation stays with the image: a plugin is available when it is a dependency, and configured when an admin adds it.

A restart on every save would drop every reply being streamed. Rebuilding the plugin runtime in the running process avoids that.

## Design

### Installed plugins

A plugin package is installed when it is listed in the `dependencies` of the root `package.json` and its own `package.json` has the keyword `scn-chat-plugin`. Every shipped plugin gets the keyword. Packages are resolved from the repository root. A fork adds a plugin with `pnpm add`, or with a `workspace:` or `file:` dependency for a local one. Local `./` specifiers are no longer supported, since a dependency covers them.

`apps/server/src/plugins/installed.ts` lists the installed plugins at startup, importing each package once. Each entry has the package name, the `description` and `version` from its `package.json`, and the JSON schema of its `optionsSchema`, from `z.toJSONSchema`. A package without `optionsSchema` gets an empty schema and takes no options. A dependency with the keyword but no default export factory is logged as an error and left out.

### Plugin instances

```
plugin_instance (
  id text primary key,          -- random, from the server
  package text,
  position integer,
  enabled integer,
  options_json text,            -- options without secret fields
  secrets_encrypted text,       -- secret fields, encrypted
  created_at, updated_at, updated_by
)
```

- **Secrets.** Top-level option fields marked `.meta({ secret: true })` are stored in `secrets_encrypted`, with the same `SecretBox` as user keys. The API never returns them. It returns the names of the secret fields that have a value. On save, a blank or missing secret keeps the stored value, and a field listed in `clearSecrets` is removed. Every shipped plugin marks its `apiKey` option as secret.
- **Order.** `position` is the load order, which decides hook order as the plugins spec describes.
- **Disabled instances** keep their options and aren't loaded.
- **Plugin IDs.** The factory decides the plugin's ID, as it does today, and some plugins derive it from their options, like `openai-compatible-<id>`. User settings, tool switches, provider IDs in model references, and user credentials all key on those IDs, so an edit that would change an instance's plugin ID is refused with "This change would rename the plugin from X to Y. Add a new instance instead."
- **Deleting** an instance leaves its users' settings and tool switches in place, so adding the same plugin back restores them.

### Plugin runtime

A plugin runtime is everything built from the plugin instances: the plugin host with its registries and hooks, and the model catalog. `apps/server/src/plugins/runtime.ts` holds the current one:

```ts
interface RuntimeHolder {
  current(): PluginRuntime
  acquire(): { runtime: PluginRuntime; release(): void }
  rebuild(instances: PluginInstance[]): Promise<void>
}
```

- **Readers.** Request handlers call `current()` once per request, and never keep a runtime between requests. Routes that read the host, providers, ingesters, hooks, or catalog change to take the holder instead of a fixed host.
- **Turns** call `acquire()` when they start and `release()` when they end, and use that runtime throughout, so a turn never mixes plugins from two runtimes. That includes the `turn:after` hooks it runs.
- **Rebuilding** imports and validates each enabled instance's options, calls each factory, checks the plugins, and runs each `setup` against a fresh host, in position order. It then swaps the new runtime in. The old runtime's `close()`, which runs its plugins' `onClose` handlers, waits until every turn that acquired it has released it.
- **One at a time.** Rebuilds are serialized. A save waits for any rebuild already running.
- **Context.** `ctx.app.name` reads the current app name on each access, so renaming the app doesn't need a rebuild.

### Saving

Every change to plugin instances, whether adding, editing, reordering, enabling, disabling, or deleting, goes through one path:

1. Validate the changed instance's options against the package's `optionsSchema`. Failures return 400 with `{ error: 'InvalidRequest', issues }`, with issue paths pointing at option fields. Refinements that span fields, like web search requiring a key for Brave, come back the same way.
2. Build a candidate runtime from the full proposed instance list. A factory or `setup` that throws, a duplicate plugin ID, a duplicate provider, tool, or ingester, or an unsupported plugin API version returns 400 with the error, and nothing changes. The candidate is closed.
3. Check the admin models against the candidate, as described below. A model left without its provider refuses the change.
4. Write the instances in one transaction, then swap the candidate in.

### Startup

At startup the runtime is built from the stored instances with the same steps, but one broken instance doesn't stop the server, since the admin area is how it gets fixed. An instance whose package is no longer installed, whose stored options fail the schema, or whose factory or `setup` throws is skipped. It is logged as an error and shown in the admin area with its error. Everything a failed plugin registered before it threw is discarded, so each plugin's setup runs against a staging context whose registrations are committed only when it finishes. Duplicate IDs keep the first instance by position and fail the rest.

### Admin models

The `models` section of `config.yml` moves to the database:

```
admin_model (
  provider text, model_id text,
  name text,
  capabilities_json text,
  roles_json text,
  is_default integer,
  position integer,
  created_at, updated_at, updated_by,
  primary key (provider, model_id)
)
```

- **Validation on save.** The provider must be registered in the current runtime and have an admin key. Every role must exist, and `roles` can't be empty, so who can use a model stays a deliberate choice. Marking a model default clears the flag on every other model.
- **Reading.** `ModelCatalog` reads admin models from the database on each call, so a model change needs no rebuild. The role check is unchanged.
- **Models whose provider isn't loaded**, because its instance was skipped at startup, are hidden from users and shown in the admin area with a warning.
- **Picking models.** Admin models are managed inside their provider's plugin block, the way users pick models for their own keys. A Refresh button next to the provider's key and base URL fetches its model list, and the admin ticks the models to offer and sets each one's name, capabilities, and roles. Refresh works on values not saved yet: the server builds a temporary copy of the plugin from the form's options, with a blank secret meaning the stored one, runs its `setup` against a scratch context, and calls the provider's `listModels` with no arguments, which uses the plugin's own key and base URL. The copy is closed afterwards. A provider without `listModels` gets a field to type a model ID instead.
- **Instance changes.** A plugin change that would leave a model without its provider, by deleting or disabling the instance or removing its admin key, is refused, naming the models.
- **Role changes.** A role that a model names can't be deleted, as [[admin]] describes.
- **Order.** `position` is the order of `GET /api/models`.

### Admin API

| Route | Purpose |
|---|---|
| `GET /api/admin/plugins/installed` | Installed plugin packages, with description, version, and options schema. |
| `GET /api/admin/plugins` | Plugin instances in order, each with its ID, package, plugin ID and name when loaded, enabled flag, options without secrets, the names of secret fields that are set, the options schema, and its status, `loaded`, `disabled`, or `failed` with the error. |
| `POST /api/admin/plugins` | Add an instance from `{ package, options }`, at the end. |
| `PUT /api/admin/plugins/:id` | Change `{ options, clearSecrets, enabled }`. |
| `DELETE /api/admin/plugins/:id` | Remove an instance. |
| `PUT /api/admin/plugins/order` | Reorder from `{ ids }`, which must list every instance. |
| `GET /api/admin/models` | Admin models in order, with a warning on any whose provider isn't loaded. |
| `POST /api/admin/models`, `PUT /api/admin/models/:provider/:id`, `DELETE /api/admin/models/:provider/:id` | Add, change, and remove admin models. |
| `PUT /api/admin/models/order` | Reorder from a list of `{ provider, id }`. |
| `POST /api/admin/plugins/list-models` | A provider's models from `{ package, instanceId?, options }`, using the form's options, with blank secrets taken from the instance. |

### Admin area

Two sections join the admin sidebar:

- **Plugins** (`/admin/plugins`). One block per instance, in order, with the plugin's name and package, its status and error, the options form generated from the schema with `SchemaFields`, an Enabled checkbox, up and down buttons, and Remove. Each block has its own Save, since each save rebuilds the runtime and can fail on its own. Secret fields show "set" when a value is stored, and a "Clear" checkbox. An "Add plugin" control at the end picks an installed package and shows its form.
- **Models in provider blocks.** A provider's block lists its admin models below the options form, each with name, capabilities, roles, and Remove, plus the Refresh button and the list of models to tick. Models save through the models routes, separately from the plugin's options.
- **Models** (`/admin/models`). The admin models from every provider in one list, for picking the default and setting the order across providers, with a link to each model's provider block.

Admin option forms support the same JSON Forms rules as user settings. Web search adds rules to its options, showing `apiKey` for engines that need a key and `baseURL` for SearXNG.

### Plugin API changes

- The Anthropic, OpenAI, and Google plugins gain `listModels`, from each API's model list endpoint, so Refresh works for them. `keyedProvider` takes an optional `listModels(apiKey)` for this. The model lists don't report capabilities, so the admin sets them.

- `docs/plugins.md` documents the `scn-chat-plugin` keyword, that options are edited in the admin area, `.meta({ secret: true })` on options, and JSON Forms rules on options.
- `PLUGIN_API_VERSION` stays 1. Existing plugins keep working, and only need the keyword and secret markers.

## Scope Boundaries

- No installing, updating, or removing plugin packages from the admin area.
- No per-model limits, quotas, or usage reporting.
- No nested secret options. Only top-level fields can be secret.
- No plugin-specific admin screens. Every admin form is generated from `optionsSchema`.
- No undo or history for plugin and model changes.
- No live reloading of plugin code. A new plugin version needs a new image.

## Edge Cases and Decisions

- Saving is strict and startup is lenient. A save that would break a plugin is refused, but a plugin that breaks at startup, for example after an upgrade, is skipped so the admin area stays reachable to fix it.
- A plugin ID can't change through an edit, because records and user data refer to it.
- Turns acquire one runtime for their whole run, so a save mid-turn never changes the tools or hooks a turn is using.
- Each instance saves on its own. A combined save would fail as a whole on one bad plugin and leave the admin guessing which one it was.
- Admin models are read from the database on each call, like roles, so they need no rebuild.
- Deleting an instance keeps user settings, so removing and re-adding a plugin loses nothing.
- Installed plugins come from the root `package.json`, not from scanning `node_modules`, which is unreliable under pnpm.

## Acceptance Criteria

Installed plugins:

- [ ] Only root dependencies with the `scn-chat-plugin` keyword are listed.
- [ ] Each listed plugin includes its description, version, and options schema.
- [ ] A keyworded package without a default export factory is left out and logged.

Instances and secrets:

- [ ] Adding an instance with invalid options returns 400 with issues pointing at the fields.
- [ ] Secret options are stored encrypted and never returned, and the API names the secret fields that are set.
- [ ] A blank secret on save keeps the stored value, and `clearSecrets` removes it.
- [ ] An edit that would change the plugin ID is refused.
- [ ] A disabled instance isn't loaded and keeps its options.
- [ ] Reordering changes the load order and the hook order.
- [ ] Deleting an instance keeps its users' settings.

Runtime:

- [ ] A saved change takes effect for the next turn without a restart.
- [ ] A turn running during a save finishes with the plugins it started with.
- [ ] The old runtime's `onClose` handlers run only after its last turn releases it.
- [ ] A save whose `setup` throws, or that duplicates a plugin, provider, tool, or ingester ID, is refused, and the running runtime is unchanged.
- [ ] Concurrent saves are applied one at a time.

Startup:

- [ ] An instance whose package isn't installed, whose options fail validation, or whose `setup` throws is skipped with its error, and the rest load.
- [ ] A skipped plugin's partial registrations are discarded.

Models:

- [ ] Adding a model with an unknown provider, a provider without an admin key, an undefined role, or no roles is refused.
- [ ] Marking a model default clears the flag on the others.
- [ ] A model change applies on the next request without a rebuild.
- [ ] Deleting or disabling a provider instance, or clearing its admin key, is refused while models use it, naming them.
- [ ] A model whose provider isn't loaded is hidden from users and flagged in the admin list.
- [ ] `list-models` returns the provider's models using the form's unsaved options, takes blank secrets from the stored instance, and closes the temporary plugin.
- [ ] The Anthropic, OpenAI, and Google plugins list their models.

Admin area:

- [ ] The plugins section adds, edits, enables, disables, reorders, and removes instances, and shows each instance's status and errors.
- [ ] A provider block's Refresh fills the model list, and ticked models are added as admin models.
- [ ] The models section sets the default and the order across providers.

## Files

- `apps/server/src/plugins/installed.ts`, `apps/server/src/plugins/instances.ts`, `apps/server/src/plugins/runtime.ts`
- `apps/server/src/plugins/host.ts`, `apps/server/src/plugins/import.ts`, `apps/server/src/plugins/routes.ts`
- `apps/server/src/providers/catalog.ts`, `apps/server/src/providers/admin-models.ts`, `apps/server/src/providers/routes.ts`
- `apps/server/src/admin/routes.ts`
- `apps/server/src/turns/runner.ts`, `apps/server/src/blobs/routes.ts`, `apps/server/src/storage/routes.ts`
- `apps/server/src/server.ts`, `apps/server/src/config.ts`
- `apps/server/src/db/migrations/0008_plugin_instances.ts`
- `apps/web/src/pages/AdminPage.tsx`, `apps/web/src/components/SchemaFields.tsx`
- `packages/plugin-api/src/index.ts`, every `plugins/*/package.json`, `plugins/anthropic/`, `plugins/openai/`, `plugins/google/`, `plugins/openai-compatible/`, `plugins/web-search/src/index.ts`
- `package.json`, `docs/plugins.md`
