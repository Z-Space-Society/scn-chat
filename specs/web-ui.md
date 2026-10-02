# Web UI

## Summary

The web UI is a deliberately plain React app built on TanStack Start. It exposes every feature with plain HTML elements and almost no styling, so its look can come entirely from a theme later without fighting existing design decisions. It covers signing in, the chat list, a conversation with branch navigation, the composer with model and effort choice and attachments, streaming replies, sharing, and settings for preferences, API keys, and plugin settings. The Hono server owns the process and runs Start inside it, and the app talks to the server only through Hono's typed client, so API changes surface as type errors.

## Motivation

The project is meant to be forked and customized, and a designer will build the production look. Both go through themes and the extension seams in later phases, not through this spec. This UI exists to prove the features work end to end, and to give forkers and the designer working components and data flow to restyle, extend, or override. Every visual choice made here is one a theme might have to undo, so this UI makes as few as possible.

The first build used Vite and React with `wouter` and hand-written data hooks. It was rebuilt on TanStack Start, Router, Query, and Form to give forkers a conventional, type-safe base, with the same behavior and acceptance criteria. See ADR 0001 for how Start sits inside Hono, and ADR 0003 for why no chat client library holds messages.

## Design

### Stack

- TanStack Start with React, server-rendering only the routes marked below.
- TanStack Router with file-based routes in `src/routes/`. Each route validates its search params.
- `hono/client`'s `hc` with the server's exported route types, for a typed API client with no hand-written API types. There are no Start server functions: Hono is the only API.
- TanStack Query for all data, both server calls and chats read from the browser store through its worker API.
- TanStack Form for the settings forms and schema forms.
- `EventSource` for reply streams, read through Query's `streamedQuery`.
- One small stylesheet carried over from the first build, for layout and a stand-in look. No component library or CSS framework yet. The styling stack is the themes spec's decision.

### Serving

The server process runs Hono, and Hono runs Start, so the server and plugins stay unbundled on Node's type stripping.

- **Production.** `vite build` writes `apps/web/dist/client` and `apps/web/dist/server/server.js`, whose default export is a fetch handler. Hono answers `/api`, `/oauth`, `/oauth-client-metadata.json`, `/xrpc`, and `/.well-known` first, then serves files from `dist/client`, then passes every other request to Start's handler.
- **Development.** The same server entry creates Vite in middleware mode on the server's HTTP server, so HMR shares its port. Each request goes through Vite's middlewares first, which serve modules and call on for everything else. Pages go to Start's server entry, which the server imports through Vite's SSR runner on each request, so web edits apply without a restart. `pnpm dev` runs one process on one port, with no proxy.
- **Request context.** Hono passes Start a context holding the Hono app and the configured app name. During server rendering, the typed client calls the Hono app in process through it, forwarding the request's cookie, and the root route reads the app name from it for the page title and `application-name` meta tag.
- `@tanstack/react-start` is pinned to an exact version, since the dev setup imports Start's server entry by its internal virtual module ID, `virtual:tanstack-start-server-entry`, as Start's own dev middleware does.

### Data

- **Server data.** Query wraps every typed-client call, keyed by route, such as `['models']` or `['preferences']`, from the factories in `src/queries.ts`. Writes are mutations that invalidate the keys they change. A 401 from any call ends the session as before. Queries do not retry or refetch on window focus, so failures show at once, as they did before Query.
- **Chats.** The chat list is the query `['conversations']`, a conversation is `['conversation', skey]`, and a search is `['search', q]`, all read from the browser store's worker. `StoreProvider` turns the store's change events into invalidations: an `index` change invalidates the chat list, a `conversation` change invalidates that conversation, and any change invalidates searches. Queries wait while the store is held by another tab. Opening a conversation also refreshes it from the PDS through the query `['conversation', skey, 'refresh']`, whose changes come back as store events.
- **URL state.** On chat routes, `m` names a focused message and `q` holds the search term. Choosing a sibling replaces `m` with that sibling, so the URL always names the branch on screen, and reloading, going back, or sharing the link keeps it.

### Routes

| Route | Screen | Server-rendered |
|---|---|---|
| `/login` | A handle field and a sign-in button that goes to `/oauth/login` | Yes |
| `/` | Chat list sidebar, and a new chat | No |
| `/chat/:skey` | Chat list sidebar and a conversation | No |
| `/shared/:ownerDid/:skey` | A shared conversation, read-only | No |
| `/settings` | Preferences, with a sidebar linking to each settings section | Yes |
| `/settings/api-keys`, `/settings/plugins`, `/settings/sync` | The other settings sections | Yes |

The signed-in routes share a layout route that is server-rendered and checks `/api/me` in its `beforeLoad`, redirecting to `/login` on a 401 before any page is sent. Its child chat routes render on the client, since chats live in the browser store. A shared route shows a sign-in prompt instead of redirecting.

### Components

- **ChatList.** Conversation titles from the browser store, newest first. Untitled conversations show "New chat". It has a button to start a new chat.
- **Conversation.** It shows the messages on the current branch, from the root to the selected leaf. A message with siblings shows "‹ 2 / 3 ›" controls that switch branches. By default the branch follows the newest sibling at each level, and below a focused message it follows the newest sibling at each level after it. It also has the title, with rename, the share control from the sharing spec, and a sync button that calls the conversation's sync route and then refreshes it in the browser store.
- **Message.**
  - Assistant text parts, including streamed text, are rendered as GitHub-flavored Markdown with `react-markdown` and `remark-gfm`. Raw HTML is not rendered, links open in a new tab, and images show their alt text, full URL, and a load button instead of loading, so injected content cannot leak the chat through an image URL without the user choosing to load it. User text is shown as plain text.
  - Reasoning parts go in a closed `<details>`.
  - Tool calls and results go in a `<details>` with their JSON.
  - Sources are shown as a list of links.
  - Images are shown inline, and files as their names.
  - A pending reply shows streamed text as it arrives. An errored reply shows its error, and a cancelled reply is labeled as stopped.
- **Message actions.** On user messages, edit, which opens the composer prefilled and sends a sibling. On assistant replies, regenerate, with an optional model change. While generating, stop.
- **Composer.** A textarea, a model select from `/api/models`, an effort select for models with the reasoning capability, and an attach button. The attach button accepts images only for models with vision, plus any type an ingester supports. Attachments upload when chosen and show a progress state. Enter sends, and Shift+Enter adds a newline.
- **Settings.** A sidebar links back to the chats and to each section, marks the current one, and holds sign out. Only the current section is shown.
  - Preferences: default model, default effort, custom instructions, and generate titles. Saving also stores the browser's time zone, which the app saves on sign-in as well when it differs from the stored one.
  - API keys: add, list with the last four characters, and delete. For providers with user endpoints, a base URL field.
  - Plugins: one form with a group per plugin and a single Save at the end, which saves every plugin's settings and any tool switches that changed. A group has a checkbox for each tool the user may switch, labeled "Enabled" when it is the plugin's only one and by tool name otherwise, then the fields generated from the plugin's JSON schema.
  - Sync: the background sync switch, shown only when the admin allows users to opt out, and a button that deletes and rebuilds the browser store.

### Schema forms

`SchemaFields` renders a JSON schema object as labeled inputs bound to a TanStack Form field each, so the parent form owns values, validation, and which fields changed. It supports strings, as text inputs or password inputs for secret fields, plus numbers, booleans as checkboxes, and string enums as selects. Any other type is shown as unsupported, not guessed at. A field's schema may carry a [JSON Forms rule](https://jsonforms.io/docs/uischema/rules) under `rule`, whose effect is `SHOW`, `HIDE`, `ENABLE`, or `DISABLE`. Its condition names another top-level field as `#/properties/<name>` and tests that field's value with a JSON Schema limited to `const`, `enum`, `not`, and `minLength`, honoring `failWhenUndefined`. A rule with any other scope, keyword, or effect is ignored with a console warning, so the field stays shown and enabled.

### Streaming

After sending, the conversation opens a stream query, `['reply-stream', skey, rkey]`, over the reply's stream endpoint. It appends deltas to the pending reply's streamed text and reasoning. On the `status` event the stream ends and the conversation query is invalidated, which fetches the final record through the browser store. If the stream fails, or the status says another server runs the reply, the conversation query refetches with a backoff from two seconds to thirty until the reply leaves `pending`.

While the reader is at the bottom of the conversation, it stays scrolled to the bottom as replies stream and messages arrive. Once they scroll up it stops following, until they scroll back down or send a message, which always scrolls to the bottom. A conversation opened on a linked message scrolls to that message instead. Switching siblings does not scroll.

## Scope Boundaries

- No visual design, theming, dark mode beyond the stand-in stylesheet, icons, or animations. Those belong to the themes spec.
- No Renderers, Slots, or plugin settings panels. Those belong to the web plugins spec.
- No server rendering of chat or shared routes.
- No code highlighting.
- No PWA, offline support, or notifications.
- No mobile-specific layout beyond what the browser does.
- No admin screens.

## Edge Cases and Decisions

- The Markdown renderer builds React elements rather than injecting HTML, so it needs no separate sanitizer. A theme may restyle it.
- The typed Hono client comes from the server's route types, so the web app and server share one definition of the API. On the server it calls the Hono app in process, and in the browser it uses `fetch`, so there is one client for both.
- The web app never imports server code. Start reaches Hono only through the request context, so the server never enters Vite's module graph or reloads on HMR.
- In development the server imports Start's server entry itself rather than letting Start install its dev middleware, because that middleware calls the entry without a request context.
- Vite loads its config through its module runner. The default loader imports a temporary bundle of the config, which `node --watch` sees and restarts on in a loop.
- With no `index.html`, Vite's dependency scan starts from the route files. Otherwise a dependency first seen when a split route loads makes Vite re-optimize mid-load, and that route fails to import.
- Unknown paths get a 404 from the server, and the client then redirects them to `/`.
- Chats are never server-rendered. Doing so would read the conversation from the PDS on every navigation and duplicate the browser store.
- The default branch is the newest sibling at each level, matching how ChatGPT shows the latest regeneration.
- `m` keeps the name search links already used. One focused message is enough to name a branch, since its ancestors are fixed and everything below it follows the newest sibling.
- Write routes read JSON without validators, so the typed client sends bodies through its request options. Response types still come from the server's routes.
- The `read` helper returns the body of the successful responses and throws an `ApiError` with the server's message otherwise.
- Where a screen shows one error for several actions, it shows the error of the action that ran last, so a later success clears an earlier failure.
- Invalidating a conversation is exact, so its own refresh query, which causes those invalidations, does not rerun in a loop.
- Adding or deleting an API key also invalidates the model list, since a user's keys add their own models.
- Shared links show a sign-in prompt when signed out, and every other route sends signed-out users to `/login`.

## Acceptance Criteria

- [ ] Signing in with a handle starts OAuth, and the app returns to the chat list afterwards.
- [ ] Signed-out users requesting a signed-in route get a redirect to `/login` from the server, before any page is rendered.
- [ ] `pnpm dev` serves the API and the web app from one process and port, and a production build serves both from the server entry.
- [ ] Creating a chat, sending a message, and watching the reply stream works end to end.
- [ ] The chat list shows new titles once they are generated.
- [ ] Sibling controls switch branches and show the matching replies, and reloading the page keeps the chosen branch.
- [ ] Regenerating adds a sibling reply and selects it.
- [ ] Editing a message adds a sibling user message with its own reply.
- [ ] Stop cancels a generating reply, which then shows as stopped.
- [ ] The effort select appears only for reasoning models.
- [ ] Image attachment is disabled for models without vision.
- [ ] A PDF attachment uploads, shows its name, and reaches the model as text.
- [ ] Settings save preferences, add and delete API keys, and save plugin settings through generated forms.
- [ ] A shared link shows the conversation read-only to a permitted viewer.
- [ ] Reasoning and tool details are collapsed by default.
- [ ] Assistant text renders as Markdown, raw HTML in it is not rendered, images in it load only on click and show their full URL first, and user text stays plain.
- [ ] If the stream drops, the reply still appears through repeated refreshes.
- [ ] The conversation follows a streaming reply while the reader is at the bottom, not after they scroll up, and scrolls to the bottom on send.
- [ ] The sync button syncs the conversation and shows changes written from another client.
- [ ] The background sync switch appears only when the admin allows opting out, and saves the account setting.
- [ ] The page title and `application-name` meta tag show the configured app name.
