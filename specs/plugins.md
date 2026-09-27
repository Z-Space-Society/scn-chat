# Plugins

## Summary

SCN Chat's features beyond the core chat loop come from plugins: model providers, tools the model can call, file ingesters that turn uploads into text, and hooks that run around each turn. A plugin is an npm package that exports a factory. The admin lists plugins by package name, with their options, in `config.yml`. At startup the server imports each package, validates its options against the schema the plugin exports, checks the plugin, and calls its `setup` function, which registers what the plugin provides. The types plugins build against live in their own package, `@scn-chat/plugin-api`, so third parties can write plugins without depending on the server.

## Motivation

The project is meant to be extended and forked. Anyone should be able to add a model provider, a search engine, or an OCR engine without touching core code. Other chat apps either have no code-level plugin system (Chatbot UI, LibreChat, which relies on YAML config and MCP) or store pasted code in the database without versioning (Open WebUI). Using npm packages gives versioning, lockfiles, and ordinary code review for free, and options validated against each plugin's schema catch configuration mistakes at startup.

The design borrows from several systems:

- **Drupal's split between registries and hooks.** Some extension points pick one implementation by ID (Drupal's Plugin API). Others let many plugins act on the same event (Drupal hooks, WordPress actions and filters).
- **Vite's plugin shape.** A plugin is a factory returning a plain typed object, and the config lists plugins in order.
- **LibreChat's config split.** Public settings go in a YAML file and secrets in `.env`.
- **Open WebUI's settings split.** Admin settings and per-user settings are separate, and forms are generated from a schema.
- **Fastify and VS Code's compatibility checks.** Each plugin declares which plugin API version it targets, and incompatible plugins are refused at startup.

## Design

### Packages

- `packages/plugin-api` (`@scn-chat/plugin-api`) exports `definePlugin` and every type a plugin sees. It depends only on `zod`, `@scn-chat/lexicons`, and `@ai-sdk/provider` for the model interface. It has its own semver version, separate from the app. Inside the workspace it exports TypeScript source like every other package. Publishing it to npm for third-party authors, built to JavaScript with type declarations, is a later step.
- `plugins/*` holds the plugins that ship with SCN Chat, each its own workspace package named `@scn-chat/plugin-<name>`. The specs for providers, attachments, and titles define the phase 1 plugins.
- The server depends on `@scn-chat/plugin-api` and implements the registries, hooks, and context behind it.

### Config file

Plugins are listed in the `plugins` section of `config.yml`, described in the foundation spec, in the order they load:

```yaml
plugins:
  - package: '@scn-chat/plugin-anthropic'
    options:
      apiKey: ${ANTHROPIC_API_KEY}
  - package: '@scn-chat/plugin-openai-compatible'
    options:
      id: cocore
      name: co/core
      baseURL: https://cocore.dev/v1
      apiKey: ${COCORE_API_KEY}
  - package: '@scn-chat/plugin-pdf-text'
  - package: '@scn-chat/plugin-titles'
```

- `package` is an npm package name, or a path starting with `./` for a local plugin. It is resolved from the directory holding `config.yml`, so a plugin installed in the project with `pnpm add` is found.
- `options` are the plugin's admin settings. Secrets come from `.env` through `${NAME}` references, never from the file itself.
- The same package may be listed more than once with different options, as the OpenAI-compatible plugin is for each endpoint.

The `models` list is described in the providers spec, `roles` in the auth spec, and `sync` in the chat-storage spec.

### Plugin shape

```ts
export default function titles(options: TitlesOptions = {}) {
  return definePlugin({
    id: 'titles',
    name: 'Chat titles',
    apiVersion: 1,
    setup(ctx) {
      ctx.hooks.on('turn:after', async (turn) => { /* ... */ })
    },
  })
}
```

A plugin package exports:

- **A default export**, the factory, which takes the options object and returns a plugin.
- **An optional `optionsSchema`**, a zod schema for the options. The server validates the configured options against it before calling the factory. A failure stops startup, naming the package and the option. A plugin without a schema gets its options unchecked.

The plugin the factory returns:

- `id` is unique across loaded plugins, and matches `^[a-z0-9-]+$`.
- `apiVersion` is the plugin API major version the plugin targets. The server supports exactly version 1 in phase 1.
- `userSettings` is an optional zod schema for per-user settings. Fields marked with `.meta({ secret: true })` are stored encrypted.
- `setup(ctx)` runs once at startup and may be async. Startup waits for every `setup` to finish, in config order.

### Plugin context

`setup` receives a narrow context. It has no raw database handle and no access to OAuth sessions, so a plugin cannot bypass record ownership by accident.

| Member | Purpose |
|---|---|
| `ctx.providers.register(provider)` | Add a model provider. See the providers spec. |
| `ctx.tools.register(tool)` | Add a tool the model can call. |
| `ctx.toolSources.register(source)` | Add a source of tools that change at runtime, such as an MCP server. |
| `ctx.ingesters.register(ingester)` | Add a file ingester. See the attachments spec. |
| `ctx.hooks.on(name, handler, options?)` | Handle a hook. |
| `ctx.models.generateText(request)` | Run a one-off model call for a user, through the provider registry. |
| `ctx.conversations.updateInfo(user, conversation, patch)` | Change a conversation's info record, written under the user's DID through the storage layer. |
| `ctx.userSettings(user)` | Read this plugin's validated settings for a user. |
| `ctx.logger` | A pino child logger tagged with the plugin ID. |
| `ctx.app` | Read-only app name and public URL. |
| `ctx.onClose(fn)` | Register cleanup to run at shutdown. |

### Registries

Registries hold implementations picked by ID or by match. Registering a duplicate ID fails startup.

- **Providers**, picked by provider ID. The providers spec defines the interface.
- **Tools**, picked by name. A tool has a `name`, a `description`, a zod `inputSchema`, and `run(input, context)`, which returns text or JSON-encodable data. A result that would push the record past the size cap is stored as a blob.
- **Tool sources**, each with `list(user)` and `call(user, name, input)`. Their tools are merged with registered tools, with names prefixed by the source ID.
- **Ingesters**, matched by MIME type. The attachments spec defines the interface.

In phase 1 no tools are registered. The interfaces exist so web search, fetch, and MCP plugins can be added without core changes.

### Hooks

Hooks let many plugins act on the same event. Every payload uses our own normalized types, never a provider's raw request or response shape.

| Hook | Kind | Payload |
|---|---|---|
| `messages:beforeModel` | filter | The system prompt and message list about to be sent, with the turn context |
| `message:afterModel` | filter | The assistant's final content before it is written, with the turn context |
| `turn:after` | action | The finished turn: conversation, user, request, and the written reply |
| `conversation:created` | action | The new conversation and its owner |
| `conversation:deleted` | action | The deleted conversation and its owner |

- **Filters** run in order, and each handler returns the value the next one receives. A filter that throws fails the turn, which ends with status `error` and an error naming the plugin.
- **Actions** run in order, and their return values are ignored. An action that throws is logged with the plugin ID, and the turn is unaffected.
- **Order.** Handlers are sorted by `options.order` (`'pre'`, `'normal'`, or `'post'`, default `'normal'`), then by the plugin's position in the config. There are no numeric priorities. The server logs each hook's resolved handler order at startup.

The hook runner is a small typed module in the server, about 80 lines, that handles ordering, filter chaining, and action error isolation. The `hookable` library has no ordering and cannot pass a value through a chain of handlers, which filters need. `tapable` has both, but needs a class per hook.

### Per-user settings

Per-user settings are stored in a `plugin_user_settings` table: DID, plugin ID, JSON value, and a separate encrypted JSON value for secret fields. Values are validated against the plugin's schema on read. Invalid stored values fail loudly and are not silently reset. The settings page shows the validation error for that plugin with a reset button, which calls `DELETE /api/plugins/:id/settings` and clears the user's stored values for it. The web UI renders a settings form from `z.toJSONSchema(userSettings)`, as the web-ui spec describes. Secret fields are encrypted with the same key and scheme as BYO API keys, described in the providers spec.

## Scope Boundaries

- No admin UI for installing or configuring plugins. Admins edit the config file and restart.
- No sandboxing. Plugins run in-process with full trust, and the docs say so.
- No user-installed plugins. If users ever add their own tools, that goes through MCP, not in-process code.
- No plugins that add UI to the web app.
- No filter over individual streaming chunks in phase 1.
- No built-in tools in phase 1.

## Edge Cases and Decisions

- Plugins are listed explicitly in `config.yml`, not discovered by scanning `node_modules`, which is unreliable under pnpm.
- Configuration is YAML, not a TypeScript file, so admins who are not developers can edit it. The plugin option schemas replace the type-checking a TypeScript file gave.
- Hook ordering uses config position plus pre, normal, and post, not numeric priorities, to avoid WordPress's priority guessing.
- Filter errors fail the turn, and action errors do not. A filter changes what the model sees or what gets written, so skipping one silently could corrupt a conversation.
- Plugin output that becomes a record goes through the context's storage methods, so it is always written under the user's DID.
- `ModelProvider` gained an optional `providerOptions`, sent with every call to that provider. The OpenAI plugin needs `store: false` and encrypted reasoning on every request, and the interface had nowhere to say so.
- `ModelAccess` carries an optional `fetch`, so a user endpoint can be reached through the private network guard.
- `@scn-chat/plugin-api/testing` exports `setupForTest`, which runs a plugin's setup against a recording context, for plugin tests.
- The per-user settings API is `GET /api/plugins/settings`, `PUT /api/plugins/:id/settings`, and `DELETE /api/plugins/:id/settings`. Secret values are never returned. A blank secret on save keeps the stored one.
- An OpenAI-compatible plugin's ID is `openai-compatible-<provider id>`, so the same package can be listed several times.
- A local plugin directory is loaded through its `package.json` `exports` or `main`, since Node's resolver ignores `exports` for directory paths.
- The server's config types (`ModelConfig`, `SyncConfig`) live in the server, since plugins never see them.

## Acceptance Criteria

- [ ] The server imports the plugins listed in `config.yml` in order and calls each `setup` once.
- [ ] A plugin package is resolved from the directory holding `config.yml`, and a `./` path loads a local plugin.
- [ ] Options that fail a plugin's schema stop startup, naming the package and the option.
- [ ] A package that cannot be found stops startup, naming it.
- [ ] Two plugins with the same ID fail startup, naming the ID.
- [ ] A plugin with an unsupported `apiVersion` fails startup, naming the plugin and version.
- [ ] Registering a duplicate provider ID, tool name, or ingester ID fails startup.
- [ ] Filter handlers run in order, with pre before normal before post, and config order within each group.
- [ ] Each filter receives the previous filter's return value.
- [ ] A throwing filter fails the turn with an error naming the plugin.
- [ ] A throwing action is logged and does not affect the turn or later actions.
- [ ] Per-user settings round-trip through storage, with secret fields stored encrypted and returned decrypted.
- [ ] Stored per-user settings that fail validation raise an error instead of being reset.
- [ ] Deleting a plugin's settings clears the user's stored values, so the schema defaults apply.
- [ ] `ctx.conversations.updateInfo` writes through the storage layer under the user's DID.
