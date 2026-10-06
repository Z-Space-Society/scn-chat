# Writing plugins

The core app is deliberately minimal, and anything beyond the core chat loop and settings are built as plugins.

- Model providers
- Tools
- File ingesters - turn uploaded files into text.
- Hooks - run on each conversation turn.

Plugins are stored in [`plugins/`](../plugins). The core providers and chat title generations are all implementated as plugins.

See [specs/plugins.md](../specs/plugins.md).

## Installing and configuring plugins

To install a plugin it first needs to be a dependency of the root `package.json` and it's own `package.json` needs to have the `scn-chat-plugin` keyword. Use `pnpm add` to add one or `workspace:` or `file:` dependency for local plugins.

Root `package.json`:
```
{
  "dependencies": {
    "@scn-chat/plugin-web-search": "workspace:*",
    "@acme/plugin-happyview": "workspace:*",
    "my-local-plugin": "file:../my-local-plugin",
    "scn-chat-plugin-kagi-extras": "1.2.0"
  }
}
```

The plugins `package.json`:
```
{
  "name": "@acme/plugin-happyview",
  "version": "0.1.0",
  "description": "Grants roles from approved HappyView applications.",
  "keywords": ["scn-chat-plugin"],
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@scn-chat/plugin-api": "workspace:*",
    "zod": "4.6.5"
  }
}
```

Plugins can then be enabled **Settings** > **Admin > Plugins**. The plugin form is generated from it's `optionsSchema`.

Set `multipleInstances = true` if the plugin should be able to be added multiple times (generic openai model config, for example).

## Anatomy of a plugin

A plugin package exports two things:

- **A default export:** Gets the options list and returns the plugin.
- **optionsSchema:** a zod schema for the options. Optional but recommended.
- **multipleInstances:** when set to `true` the plugin can be added multiple times each with it's own configuration. Optional.

The following snippet is an example of a plugin that passes today's date to the model:

```ts
import { definePlugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z.object({ locale: z.string().default('en-US') }).strict()

const userSettings = z.object({
  timeZone: z
    .string()
    .refine((zone) => Intl.supportedValuesOf('timeZone').includes(zone), 'Unknown time zone')
    .optional()
    .meta({ description: 'Your time zone (example: America/Vancouver)' }),
})

/** Pass today's date to the model in the user's timezone. */
export default function currentDate(options: z.infer<typeof optionsSchema>) {
  return definePlugin({
    id: 'current-date',
    name: 'Current date',
    apiVersion: 1,
    userSettings,
    setup(ctx) {
      ctx.hooks.on('messages:beforeModel', async (prompt, turn) => {
        const { timeZone } = await ctx.userSettings(turn.user)
        const today = new Date().toLocaleDateString(options.locale, {
          dateStyle: 'full',
          timeZone,
        })
        return { ...prompt, instructions: `Today is ${today}.\n\n${prompt.instructions}`.trim() }
      })
    },
  })
}
```

Plugin object fields:

| Field | Meaning |
|---|---|
| `id` | Unique machine name for the plugin. A single plugin can be uses multiple times (for example, `openai-compatible`). In this case set the ID to represent it's use-case, i.e. `openai-compatible-scn`. |
| `name` | User-facing name of the plugin, where applicable. |
| `apiVersion` | The server currently supports only `1`. |
| `userSettings` | Optional. A zod object schema for per-user settings. See [Per-user settings](#per-user-settings). |
| `setup(ctx)` | Runs when the plugin loads, at startup and again whenever an admin changes the plugins. |

## The plugin context

Context passed to the plugins `setup` handler can include the following data. Plugins don't get a database handle or oauth session so they can't bypass ownership, any data they need must be passed in via `ctx`.

| Member | Use |
|---|---|
| `ctx.providers.register(provider)` | Add a model provider. |
| `ctx.tools.register(tool)` | Add a tool the model can call. |
| `ctx.toolSources.register(source)` | Add a set of tools. |
| `ctx.roles.syncMembers(role, dids)` | See [Roles](#roles). |
| `ctx.roles.addMember(role, did)` | See [Roles](#roles). |
| `ctx.accounts.suspend(did, { reason })` | Suspend an account. |
| `ctx.accounts.restore(did)` | Restore a suspended account. |
| `ctx.ingesters.register(ingester)` | Add a file ingester. |
| `ctx.ingesters.accepts(mimeType)` | Check if a file type is handled by an available ingester. |
| `ctx.ingesters.ingest(file)` | Extract a file's text. |
| `ctx.hooks.on(name, handler, options?)` | Implement a hook. |
| `ctx.models.generateText(request)` | Make a one-off model call on a user's behalf. |
| `ctx.conversations.updateInfo(user, conversation, patch)` | Change a conversation's `info` record, such as its title or tags. |
| `ctx.userSettings(user)` | Read this plugin's settings for a user. |
| `ctx.logger` | A logger object. Logs are tagged with the plugin's ID. |
| `ctx.app` | Read the app's name and public URL. |
| `ctx.onClose(fn)` | Clean up when the plugin unloads, at shutdown or when an admin changes plugins. |

## Model providers

A provider connects SCN Chat to a model API. See [`plugins/openai-compatible`](../plugins/openai-compatible/src/index.ts) for an example.

| Field | Meaning |
|---|---|
| `id` | The inference provider ID (`scn`, `cocore`, `openai`, etc.). |
| `name` | User-facing name of the provider. |
| `hasAdminKey` | Whether the admin configured a key. |
| `userKeys` | True if users can add their own API keys for this provider. |
| `userEndpoints` | True if users can add their own base URLs. |
| `allowPrivateNetworks` | True if user endpoints are allowed to use private network addresses, such as a self-hosted model on a home network. Off by default. |
| `replay` | Set to `'replay'` to send earlier reasoning and provider data back on later turns (some providers require this). `'drop'` leaves them out. |
| `providerOptions` | AI SDK provider options. Optional. |
| `createModel(access)` | Returns the model. `access.apiKey` is the user's own key when they have one; otherwise use the admin key. When `access.fetch` is set, the model must use it: it guards user endpoints against private addresses. |
| `listModels(access)` | Lists the models that can be used. Optional. |

## Tools

A tool supports:
 - `name`
 - `description`
 - zod `inputSchema`
 - `run(input, context)` - returns a string or JSON-encodable data.
 - `defaultEnabled` - When set, enabled by default unless the user explicitly disables it.
 - `userToggle` - Can the user toggle the tool on/off?
 - `untrusted` - Does the tool return untrusted output?

`context` includes:
 - `user` - the user's DID.
 - `conversation` - the conversation URI.
 - `roles` - the user's roles when the turn started.
 - `signal` - aborts when the turn is cancelled or times out.
 - `fetch` - use instead of the global fetch for URLs a user or the model chose.
 - `cite({ url, title })` - adds a source link to the reply.
 - `turnCache` - a map for keeping data between calls to the tool during one turn, such as a page read in parts.

The model gets tools listed in `generation.tools`. Defaults to tools the user has switched on.

## Roles

A plugin can manage role membership itself.

- `ctx.roles.syncMembers(role, dids)` remove / add DIDs to a role. Returns the count of adds/removes.
- `ctx.roles.addMember(role, did)` add one member. An account isn't required to add a DID to a role.


See [`plugins/scn-member-registry`](../plugins/scn-member-registry/src/index.ts) as an example.

## File ingesters

An ingester converts uploaded files into text.

- `accepts`: a list of MIME types, where patterns like `text/*` are allowed.
- `method`: either `'text'` or `'ocr'`.
- `priority`: The ingester with the highest priority will handle the upload when multiple ingesters support the same MIME type.
- `ingest({ bytes, mimeType, name })`: returns `{ text }`.

See [`plugins/pdf-text`](../plugins/pdf-text/src/index.ts) as an example.

## Hooks

| Hook | Kind | Receives |
|---|---|---|
| `messages:beforeModel` | filter | Instructions and messages about to be sent to the model, and the turn context. |
| `message:afterModel` | filter | Reply's final content, before it's written to the PDS, and the turn context. |
| `turn:after` | action | The completed turn, including the written reply. |
| `conversation:created` | action | The owner's DID and the conversation URI. |
| `conversation:deleted` | action | The owner's DID and the conversation URI. |
| `signIn:before` | action | The DID, handle, and PDS of the user signing in. |
| `cron` | action | Cron run start time. |

- **Filters:** Each handlers return value is sent to the next filter.
- **Actions:** Return values are ignored. If an action raises an exception it's logged and the turn and later actions continue.
- **Order:** Pass `{ order: 'pre' }` or `{ order: 'post' }` to run before or after the `'normal'` handlers.
- **Turn context:** `turn.tools` lists the tools offered to the model this turn, so a `messages:beforeModel` filter can add guidance for its tools only when they are in use.

## Per-user settings

If `userSettings` is configured users will see a settings form for the plugin on the settings page, generated from the defined zod schema.

- **Secrets:** Mark a field with `.meta({ secret: true })` to store it encrypted.
- **Conditional fields:** Add a [JSON Forms rule](https://jsonforms.io/docs/uischema/rules) to a field with `.meta({ rule })` to show, hide, enable, or disable it based on another field's value. Conditions support `const`, `enum`, `not`, and `minLength`.
- **Reading settings:** `ctx.userSettings(user)` returns the user's settings.
- **Invalid values:** If stored values no longer match the schema an exception is raised.

## Calling models and changing records

- Use `ctx.models.generateText({ user, model, system, prompt, maxOutputTokens, effort })` for a one-off model call. The model resolves as it would in a chat (previously used model => user default => system default). It returns `{ text, finishReason }`.
- Use `ctx.conversations.updateInfo(user, conversation, patch, options?)` to update a conversation's `info` record. Pass `{ unlessUserTitled: true }` so a title the user set won't be overwritten.

These are the only ways a plugin should touch the user's data. Never write records via any other route.
