# Writing plugins

The core app is deliberately minimal, and anything beyond the core chat loop and settings are built as plugins.

- Model providers
- Tools
- File ingesters - turn uploaded files into text.
- Hooks - run on each conversation turn.

Plugins are stored in [`plugins/`](../plugins). The core providers and chat title generations are all implementated as plugins.

See [specs/plugins.md](../specs/plugins.md).

## Loading plugins

Plugins are configured in [config.yml](../config.example.yml). They're loaded in the same order they're listed in.

```yaml
plugins:
  - package: '@scn-chat/plugin-openai-compatible'
    options:
      id: cocore
      name: co/core
      baseURL: https://cocore.dev/v1
      apiKey: ${COCORE_API_KEY}
  - package: '@scn-chat/plugin-titles'
```

## Anatomy of a plugin

A plugin package exports two things:

- **A default export:** Gets the options list and returns the plugin.
- **optionsSchema:** a zod schema for the options. Optional but recommended.

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
| `setup(ctx)` | Runs once at startup and may be async. Startup waits for every plugin's setup, in config order. |

## The plugin context

Context passed to the plugins `setup` handler can include the following data. Plugins don't get a database handle or oauth session so they can't bypass ownership, any data they need must be passed in via `ctx`.

| Member | Use |
|---|---|
| `ctx.providers.register(provider)` | Add a model provider. |
| `ctx.tools.register(tool)` | Add a tool the model can call. |
| `ctx.toolSources.register(source)` | Add a set of tools. |
| `ctx.ingesters.register(ingester)` | Add a file ingester. |
| `ctx.hooks.on(name, handler, options?)` | Implement a hook. |
| `ctx.models.generateText(request)` | Make a one-off model call on a user's behalf. |
| `ctx.conversations.updateInfo(user, conversation, patch)` | Change a conversation's `info` record, such as its title or tags. |
| `ctx.userSettings(user)` | Read this plugin's settings for a user. |
| `ctx.logger` | A logger object. Logs are tagged with the plugin's ID. |
| `ctx.app` | Read the app's name and public URL. |
| `ctx.onClose(fn)` | Clean up at shutdown. |

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
 - `run(input, context)` - returns a string or JSON-encodable data. `context` includes the user's DID and conversation URI.

Tools are opt-in per message: a conversation turn can only use tools that were sent as part of `generation.tools`.

## File ingesters

An ingester converts uploaded files into text the model can read.

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

- **Filters:** Each handlers return value is sent to the next filter.
- **Actions:** Return values are ignored. If an action raises an exception it's logged and the turn and later actions continue.
- **Order:** Pass `{ order: 'pre' }` or `{ order: 'post' }` to run before or after the `'normal'` handlers.
- **Turn context:** `turn.tools` lists the tools offered to the model this turn, so a `messages:beforeModel` filter can add guidance for its tools only when they are in use.

## Per-user settings

If `userSettings` is configured users will see a settings form for the plugin on the settings page, generated from the defined zod schema.

- **Secrets:** Mark a field with `.meta({ secret: true })` to store it encrypted.
- **Reading settings:** `ctx.userSettings(user)` returns the user's settings.
- **Invalid values:** If stored values no longer match the schema an exception is raised.

## Calling models and changing records

- Use `ctx.models.generateText({ user, model, system, prompt, maxOutputTokens, effort })` for a one-off model call. The model resolves as it would in a chat (previously used model => user default => system default). It returns `{ text, finishReason }`.
- Use `ctx.conversations.updateInfo(user, conversation, patch, options?)` to update a conversation's `info` record. Pass `{ unlessUserTitled: true }` so a title the user set won't be overwritten.

These are the only ways a plugin should touch the user's data. Never write records via any other route.
