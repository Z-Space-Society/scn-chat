# Plugins

## Summary

SCN Chat's features beyond the core chat loop come from plugins: model providers, tools the model can call, file ingesters that turn uploads into text, and hooks that run around each turn. A plugin is an npm package that exports a factory. Plugins are installed as dependencies of the project, and the admin adds and configures them in the admin area, as the admin-plugins spec describes. The server validates each plugin's options against the schema the plugin exports, checks the plugin, and calls its `setup` function, which registers what the plugin provides. The types plugins build against live in their own package, `@scn-chat/plugin-api`, so third parties can write plugins without depending on the server.

## Motivation

The project is meant to be extended and forked. Anyone should be able to add a model provider, a search engine, or an OCR engine without touching core code. Other chat apps either have no code-level plugin system (Chatbot UI, LibreChat, which relies on YAML config and MCP) or store pasted code in the database without versioning (Open WebUI). Using npm packages gives versioning, lockfiles, and ordinary code review for free, and options validated against each plugin's schema catch configuration mistakes when the admin saves them.

The design borrows from several systems:

- **Drupal's split between registries and hooks.** Some extension points pick one implementation by ID (Drupal's Plugin API). Others let many plugins act on the same event (Drupal hooks, WordPress actions and filters).
- **Vite's plugin shape.** A plugin is a factory returning a plain typed object, and plugins load in a set order.
- **Open WebUI's settings split.** Admin settings and per-user settings are separate, and forms are generated from a schema.
- **Fastify and VS Code's compatibility checks.** Each plugin declares which plugin API version it targets, and incompatible plugins are refused when they load.

## Design

### Packages

- `packages/plugin-api` (`@scn-chat/plugin-api`) exports `definePlugin` and every type a plugin sees. It depends only on `zod`, `@scn-chat/lexicons`, and `@ai-sdk/provider` for the model interface. It has its own semver version, separate from the app. Inside the workspace it exports TypeScript source like every other package. Publishing it to npm for third-party authors, built to JavaScript with type declarations, is a later step.
- `plugins/*` holds the plugins that ship with SCN Chat, each its own workspace package named `@scn-chat/plugin-<name>`. The specs for providers, attachments, and titles define the phase 1 plugins.
- The server depends on `@scn-chat/plugin-api` and implements the registries, hooks, and context behind it.

### Installing and configuring

A plugin package is installed when it is a dependency of the root `package.json` with the keyword `scn-chat-plugin`. The admin adds installed plugins in the admin area, each with its own options, in the order they load. A package that exports `multipleInstances = true` may be added more than once with different options, as the OpenAI-compatible plugin is for each endpoint. Others can be added once. The admin-plugins spec describes plugin instances, how options are stored, and how changes apply without a restart.

The `models` list is described in the admin-plugins spec, roles in the admin spec, and sync settings in the admin-settings spec.

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
- **An optional `optionsSchema`**, a zod schema for the options. The server validates the options against it before calling the factory, and the admin area generates the plugin's form from it. A plugin without a schema takes no options.

The plugin the factory returns:

- `id` is unique across loaded plugins, and matches `^[a-z0-9-]+$`.
- `apiVersion` is the plugin API major version the plugin targets. The server supports exactly version 1 in phase 1.
- `userSettings` is an optional zod schema for per-user settings. Fields marked with `.meta({ secret: true })` are stored encrypted.
- `setup(ctx)` runs when the plugin loads and may be async. Plugins load at startup and again whenever an admin changes them, one at a time and in order. A plugin's registrations only count once its `setup` finishes.

### Plugin context

`setup` receives a narrow context. It has no raw database handle and no access to OAuth sessions, so a plugin cannot bypass record ownership by accident.

| Member | Purpose |
|---|---|
| `ctx.providers.register(provider)` | Add a model provider. See the providers spec. |
| `ctx.tools.register(tool)` | Add a tool the model can call. |
| `ctx.toolSources.register(source)` | Add a source of tools that change at runtime, such as an MCP server. |
| `ctx.roles.syncMembers(role, dids)`, `ctx.roles.addMember(role, did)` | Change a role's members. See the scn-member-registry spec. |
| `ctx.accounts.suspend(did, { reason })`, `ctx.accounts.restore(did)` | Suspend or restore an account, as the admin spec describes. Each returns whether an account changed. |
| `ctx.ingesters.register(ingester)` | Add a file ingester. See the attachments spec. |
| `ctx.hooks.on(name, handler, options?)` | Handle a hook. |
| `ctx.models.generateText(request)` | Run a one-off model call for a user, through the provider registry. |
| `ctx.conversations.updateInfo(user, conversation, patch)` | Change a conversation's info record, written under the user's DID through the storage layer. |
| `ctx.userSettings(user)` | Read this plugin's validated settings for a user. |
| `ctx.logger` | A pino child logger tagged with the plugin ID. |
| `ctx.app` | Read-only app name and public URL. The name is read live, since admins can change it. |
| `ctx.onClose(fn)` | Register cleanup to run when the plugin unloads, at shutdown or when an admin changes the plugins. |

### Registries

Registries hold implementations picked by ID or by match. Registering a duplicate ID fails the plugin that registered it.

- **Providers**, picked by provider ID. The providers spec defines the interface.
- **Tools**, picked by name. A tool has a `name`, a `description`, a zod `inputSchema`, and `run(input, context)`, which returns text or JSON-encodable data. A result that would push the record past the size cap is stored as a blob. The web-search spec adds tool switches, untrusted output, and the tool context's `fetch`, `cite`, and `turnCache`.
- **Tool sources**, each with `list(user)` and `call(user, name, input)`. Their tools are merged with registered tools, with names prefixed by the source ID.
- **Ingesters**, matched by MIME type. The attachments spec defines the interface.

The web search and fetch plugins are the first tools. MCP servers are expected to arrive as tool sources.

### Hooks

Hooks let many plugins act on the same event. Every payload uses our own normalized types, never a provider's raw request or response shape.

| Hook | Kind | Payload |
|---|---|---|
| `messages:beforeModel` | filter | The system prompt and message list about to be sent, with the turn context |
| `message:afterModel` | filter | The assistant's final content before it is written, with the turn context |
| `turn:after` | action | The finished turn: conversation, user, request, and the written reply |
| `conversation:created` | action | The new conversation and its owner |
| `conversation:deleted` | action | The deleted conversation and its owner |
| `signIn:before` | action | The DID, handle, and PDS of someone signing in, before the access check. See the scn-member-registry spec. |
| `cron` | action | When the cron run started. See the cron spec. |

- **Filters** run in order, and each handler returns the value the next one receives. A filter that throws fails the turn, which ends with status `error` and an error naming the plugin.
- **Actions** run in order, and their return values are ignored. An action that throws is logged with the plugin ID, and the turn is unaffected.
- **Order.** Handlers are sorted by `options.order` (`'pre'`, `'normal'`, or `'post'`, default `'normal'`), then by the plugin's position in the admin area. There are no numeric priorities. The server logs each hook's resolved handler order whenever the plugins load.

The hook runner is a small typed module in the server, about 80 lines, that handles ordering, filter chaining, and action error isolation. The `hookable` library has no ordering and cannot pass a value through a chain of handlers, which filters need. `tapable` has both, but needs a class per hook.

### Per-user settings

Per-user settings are stored in a `plugin_user_settings` table: DID, plugin ID, JSON value, and a separate encrypted JSON value for secret fields. Values are validated against the plugin's schema on read. Invalid stored values fail loudly and are not silently reset. The settings page shows the validation error for that plugin with a reset button, which calls `DELETE /api/plugins/:id/settings` and clears the user's stored values for it. The web UI renders a settings form from `z.toJSONSchema(userSettings)`, as the web-ui spec describes. Secret fields are encrypted with the same key and scheme as BYO API keys, described in the providers spec.

## Scope Boundaries

- No installing plugin packages from the admin area. Installing stays with the image.
- No sandboxing. Plugins run in-process with full trust, and the docs say so.
- No user-installed plugins. If users ever add their own tools, that goes through MCP, not in-process code.
- No plugins that add UI to the web app.
- No filter over individual streaming chunks in phase 1.
- No built-in tools in phase 1.

## Edge Cases and Decisions

- Installed plugins come from the root `package.json`, not from scanning `node_modules`, which is unreliable under pnpm.
- Hook ordering uses the plugin's position plus pre, normal, and post, not numeric priorities, to avoid WordPress's priority guessing.
- Filter errors fail the turn, and action errors do not. A filter changes what the model sees or what gets written, so skipping one silently could corrupt a conversation.
- Plugin output that becomes a record goes through the context's storage methods, so it is always written under the user's DID.
- `ModelProvider` gained an optional `providerOptions`, sent with every call to that provider. The OpenAI plugin needs `store: false` and encrypted reasoning on every request, and the interface had nowhere to say so.
- `ModelAccess` carries an optional `fetch`, so a user endpoint can be reached through the private network guard.
- `@scn-chat/plugin-api/testing` exports `setupForTest`, which runs a plugin's setup against a recording context, for plugin tests.
- The per-user settings API is `GET /api/plugins/settings`, `PUT /api/plugins/:id/settings`, and `DELETE /api/plugins/:id/settings`. Secret values are never returned. A blank secret on save keeps the stored one.
- An OpenAI-compatible plugin's ID is `openai-compatible-<provider id>`, so the same package can be listed several times.
- Local plugins are dependencies too, through `workspace:` or `file:`, so there are no path specifiers.
- The server's settings types live in the server, since plugins never see them.

## Acceptance Criteria

- [ ] The server loads the configured plugins in order and calls each `setup` once per load.
- [ ] Options that fail a plugin's schema are reported, naming the option.
- [ ] Two plugins with the same ID fail to load, naming the ID.
- [ ] A plugin with an unsupported `apiVersion` fails to load, naming the plugin and version.
- [ ] Registering a duplicate provider ID, tool name, or ingester ID fails to load.
- [ ] A plugin whose `setup` throws contributes none of its registrations.
- [ ] Filter handlers run in order, with pre before normal before post, and plugin order within each group.
- [ ] Each filter receives the previous filter's return value.
- [ ] A throwing filter fails the turn with an error naming the plugin.
- [ ] A throwing action is logged and does not affect the turn or later actions.
- [ ] Per-user settings round-trip through storage, with secret fields stored encrypted and returned decrypted.
- [ ] Stored per-user settings that fail validation raise an error instead of being reset.
- [ ] Deleting a plugin's settings clears the user's stored values, so the schema defaults apply.
- [ ] `ctx.conversations.updateInfo` writes through the storage layer under the user's DID.
