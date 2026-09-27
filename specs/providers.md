# Providers

## Summary

A provider connects SCN Chat to a model API. Providers are plugins that register with the provider registry from the plugins spec. Each provider turns a model ID and an API key into a Vercel AI SDK language model, and the chat-turns spec drives that model. Admins configure providers and a list of models everyone can use in `config.yml`. Users can add their own API keys for any provider that allows it, and, when the admin permits, their own OpenAI-compatible endpoints. User keys are encrypted in the app database. Phase 1 ships four provider plugins: Anthropic, OpenAI, Google, and OpenAI-compatible, which covers OpenRouter, co/core, llama.cpp, vLLM, and Ollama.

## Motivation

Users should be able to chat with any model they have access to, and switch models mid-conversation. Admins of an instance should be able to offer models to everyone. The AI SDK already handles streaming, tool calls, reasoning, and provider differences for dozens of APIs, so each provider plugin is a thin wrapper around one AI SDK provider package.

## Design

### Provider interface

In `@scn-chat/plugin-api`:

```ts
interface ModelProvider {
  id: string                    // matches modelRef.provider, e.g. 'anthropic', 'cocore'
  name: string                  // shown in the UI
  userKeys: boolean             // whether users may add their own API key
  userEndpoints?: boolean       // whether users may add their own base URLs (OpenAI-compatible only)
  createModel(args: { modelId: string; apiKey?: string; baseURL?: string }): LanguageModelV4
  listModels?(args: { apiKey?: string; baseURL?: string }): Promise<ModelInfo[]>
  replay: ReplayPolicy          // how earlier reasoning is sent back, see below
}

interface ModelInfo {
  id: string
  name: string
  capabilities: { vision: boolean; reasoning: boolean; tools: boolean }
}
```

`LanguageModelV4` is the AI SDK's provider specification, from `@ai-sdk/provider`. That package is separate from the `ai` runtime and versions the interface explicitly. Returning a model that implements it, instead of our own streaming interface, means any AI SDK provider package, including community ones, can become an SCN Chat provider in a few lines. The rest of our interface (IDs, keys, listing, replay) stays ours.

`createModel` is called per request, since API keys can differ per user. The AI SDK factories are cheap to call.

### Phase 1 provider plugins

| Package | AI SDK package | Notes |
|---|---|---|
| `@scn-chat/plugin-anthropic` | `@ai-sdk/anthropic` | `createAnthropic({ apiKey })` |
| `@scn-chat/plugin-openai` | `@ai-sdk/openai` | Responses API, with `store: false` and `include: ['reasoning.encrypted_content']` so reasoning can be replayed without OpenAI storing it |
| `@scn-chat/plugin-google` | `@ai-sdk/google` | `createGoogle({ apiKey })` |
| `@scn-chat/plugin-openai-compatible` | `@ai-sdk/openai-compatible` | Takes `id`, `name`, `baseURL`, and optional `apiKey`. Can be listed several times with different IDs. Sets `includeUsage: true` |

Each plugin takes an optional admin `apiKey` and `userKeys` (default `true`) as options, and exports a zod `optionsSchema` for them. The OpenAI-compatible plugin also takes `userEndpoints` (default `false`) and `allowPrivateNetworks` (default `false`).

### Models

The `models` list in `config.yml` names the models every signed-in user can use with the admin's keys:

```yaml
models:
  - provider: anthropic
    id: claude-sonnet-5
    name: Claude Sonnet 5
    capabilities: { vision: true, reasoning: true, tools: true }
    roles: [user]
    default: true
```

- Startup fails if a model names a provider that is not registered, or a provider without an admin key.
- Exactly zero or one model has `default: true`. It is the fallback when a request names no model, the conversation has no earlier reply, and the user's preferences set no default.

Each admin model's `roles` lists the roles allowed to use it, using the roles from the auth spec. `roles: ['user']` opens a model to every signed-in user. `roles` is required, so who can use a model is always a deliberate choice, and a model without it fails startup. A model naming an undefined role also fails startup. Roles never restrict a user's own keys.

### User credentials

A user adds a credential for a provider that allows user keys. It holds an API key, an optional display name, a base URL when the provider allows user endpoints, and the model IDs the user wants to use, with their capabilities. When the provider implements `listModels`, the UI offers its list.

Credentials are stored in a `provider_credential` table: ID, owner DID, provider ID, name, slug, base URL, encrypted API key, models as JSON, and timestamps. A user has at most one credential per provider ID, except on providers with user endpoints, where each credential is its own endpoint. The user picks a slug for each endpoint, unique among their credentials and matching `^[a-z0-9-]+$`, and the model reference's provider value becomes `user:<slug>`. Records therefore name something the user chose, not a database ID, which survives deleting and re-adding the endpoint.

### Secret encryption

`apps/server/src/secrets.ts` encrypts API keys and secret plugin settings with AES-256-GCM from `node:crypto`. The key is a 32-byte value in the `SECRET_KEY` environment variable, base64 encoded, and startup fails without it. Each value is stored as `v1:<keyId>:<iv>:<tag>:<ciphertext>`, where the key ID is the first eight hex characters of the key's SHA-256. Values encrypted with a retired key stay readable while that key is listed in `SECRET_KEYS_OLD`, a comma-separated list, so the key can be rotated later without a migration. The version prefix lets the scheme itself change later. Keys are never logged, never returned by the API, and shown in the UI only as their last four characters.

### Private network guard

Requests to a user-supplied base URL go through a dedicated `fetch` passed to the AI SDK provider factory. It refuses loopback, private, link-local, and unique-local addresses, unless the provider was configured with `allowPrivateNetworks: true`, in three places. The parsed URL's host is checked first when it is an IP literal, including IPv4-mapped IPv6 addresses, since no DNS lookup happens for those. The undici `Agent`'s DNS lookup checks every resolved address. Its connect step checks the socket's actual remote address before sending anything. The last two mean the address that was checked is the one connected to, so DNS rebinding cannot slip past. Redirects are not followed. That stops users from making the server fetch internal services. Admin-configured base URLs are trusted.

### Resolving a model reference

Given a user and a `modelRef` `{ provider, id }`:

1. If the user has a credential for `provider` that lists `id`, use it.
2. Otherwise, if `{ provider, id }` is in the admin `models` list and one of the user's roles is allowed to use it, use the admin key.
3. Otherwise fail with `ModelUnavailable`, naming the model.

The user's own key wins over the admin's, so users who bring a key pay for their own usage.

### Effort

The lexicon's effort maps onto the AI SDK's cross-provider `reasoning` option. Each AI SDK provider package translates that into its own setting, such as Anthropic's thinking effort, OpenAI's reasoning effort, or Google's thinking level.

| Lexicon | AI SDK `reasoning` |
|---|---|
| absent | `'provider-default'` |
| `none` | `'none'` |
| `low` | `'low'` |
| `medium` | `'medium'` |
| `high` | `'high'` |
| `max` | `'xhigh'` |

An unknown value maps to `'provider-default'` with a logged warning. Effort is not sent to models without the reasoning capability.

### Replaying earlier reasoning

Some providers require their earlier reasoning to be sent back on later turns, carrying provider data exactly as it was returned. The AI SDK exposes that data as `providerMetadata` on streamed parts, and takes it back as `providerOptions` on message parts.

Each provider declares a `ReplayPolicy`:

- **Anthropic:** replay reasoning parts with their signature. Redacted reasoning has empty text and replays its encrypted data.
- **OpenAI:** replay reasoning with its item ID and encrypted content.
- **Google:** replay thought signatures, which Google attaches to text and tool-call parts as well as reasoning.
- **OpenAI-compatible:** drop earlier reasoning. Most open models expect it removed from history.

Reasoning from a different provider than the current turn's is always dropped.

The provider data is stored in the `providerData` field of reasoning, text, and tool-call parts, as the JSON-encoded `providerMetadata` the AI SDK returned for that part. On replay, it is decoded and passed back as the part's `providerOptions`. Provider data from a different provider than the current turn's is never sent.

## Scope Boundaries

- No admin UI. Providers and admin models are configured in the config file.
- No usage limits, quotas, or billing for admin models beyond role checks.
- No automatic model discovery for admin models. They are listed explicitly.
- No image generation, speech, or embedding models.

## Edge Cases and Decisions

- A user's own key takes priority over the admin key for the same model.
- Private network addresses are refused for user endpoints by default, and allowed per provider for self-hosters running local models.
- Provider data is kept as an opaque JSON string per part, so any provider's replay data fits without lexicon changes.
- The plugin API depends on `@ai-sdk/provider`'s model specification, not on the `ai` runtime. If the AI SDK were ever abandoned, an adapter implementing that interface keeps existing plugins working.
- The provider routes are `GET /api/models`, `GET /api/providers`, `POST /api/providers/:id/list-models`, and `GET`, `POST`, and `DELETE` under `/api/credentials`.
- Credentials store the key's last four characters in a `key_hint` column, so listing them never decrypts a key.
- The guard's blocklist is injectable, so tests can use a local server as a stand-in for a public host.

## Acceptance Criteria

- [ ] Each phase 1 provider plugin creates a working AI SDK model from a model ID and API key.
- [ ] Startup fails when an admin model names an unregistered provider or a provider without an admin key.
- [ ] Startup fails when more than one admin model is marked default.
- [ ] A user credential's API key is stored encrypted and never returned by the API.
- [ ] Startup fails without a valid `SECRET_KEY`.
- [ ] Resolution uses the user's key when the user has one for the model.
- [ ] Resolution falls back to the admin key for an admin model when one of the user's roles allows it.
- [ ] Resolution fails with `ModelUnavailable` for a model the user cannot use.
- [ ] A model with `roles: ['user']` is available to every signed-in user.
- [ ] An admin model without `roles` fails startup.
- [ ] A user endpoint whose host is a private IP literal, such as `127.0.0.1` or an IPv4-mapped IPv6 address, is refused.
- [ ] A user without an allowed role cannot use an admin model but can use their own keys for it.
- [ ] An admin model naming an undefined role fails startup.
- [ ] A user endpoint resolving to a private address is refused unless the provider allows private networks.
- [ ] A hostname that resolves to a public address when checked and a private one when connecting is still refused.
- [ ] Redirects from a user endpoint are not followed.
- [ ] A value encrypted with a key in `SECRET_KEYS_OLD` still decrypts, and new values use `SECRET_KEY`.
- [ ] A user endpoint's model references use the user's slug.
- [ ] Each lexicon effort value maps to the AI SDK reasoning value in the table.
- [ ] Reasoning from a different provider than the current turn's is not replayed.
- [ ] `GET /api/models` lists the admin models the user may use plus the models from the user's credentials.
