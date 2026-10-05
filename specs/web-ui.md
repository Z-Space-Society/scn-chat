# Web UI

## Summary

The web UI is a deliberately plain React app built on TanStack Start. It exposes every feature with plain HTML elements and almost no styling, so its look can come entirely from a theme later without fighting existing design decisions. It covers signing in, the chat list, a conversation with branch navigation, the composer with model and effort choice and attachments, streaming replies, sharing, settings for preferences, API keys, and plugin settings, and the admin area from the admin specs. The Hono server owns the process and runs Start inside it, and the app talks to the server only through Hono's typed client, so API changes surface as type errors.

## Motivation

The project is meant to be forked and changed in code, and a designer will build the production look. Making the code easy to extend and the styling are later phases, not this spec. This UI exists to prove the features work end to end, and to give forkers and the designer working components and data flow to restyle, extend, or override. Every visual choice made here is one a theme might have to undo, so this UI makes as few as possible.

The first build used Vite and React with `wouter` and hand-written data hooks. It was rebuilt on TanStack Start, Router, Query, and Form to give forkers a conventional, type-safe base, with the same behavior and acceptance criteria. See ADR 0001 for how Start sits inside Hono, and ADR 0003 for why no chat client library holds messages.

## Design

### Stack

- TanStack Start with React. Routes render on the server unless they opt out, and the chat and shared routes do.
- React Compiler, through `@rolldown/plugin-babel` and plugin-react's `reactCompilerPreset`, memoizes components and hooks in the browser build and in tests. Server rendering runs uncompiled, since it renders once.
- TanStack Router with file-based routes in `src/routes/`. Each route validates its search params.
- Code is grouped by feature in `src/features/`: `auth`, `chat-list`, `conversation`, `sharing`, `models`, `settings`, and `admin`. A feature holds whichever of `pages/`, `components/`, `hooks/`, and `lib/` it needs, and its `queries.ts`. `pages/` holds what routes render, layouts included, each file named after its component. Routes stay thin, loading data and rendering a feature's page. Code that several features use and none owns lives in `src/shared/`, and the browser store in `src/store/`.
- `hono/client`'s `hc` with the server's exported route types, for a typed API client with no hand-written API types. There are no Start server functions: Hono is the only API.
- TanStack Query for all data, both server calls and chats read from the browser store through its worker API.
- TanStack Form for the settings, admin, and sharing forms, including the forms built from schemas.
- `EventSource` for reply streams, read through Query's `streamedQuery`, which Query still exports as `experimental_streamedQuery`.
- One small stylesheet carried over from the first build, for layout and a stand-in look. No component library or CSS framework yet. The styling stack is the styling spec's decision.

### Serving

The server process runs Hono, and Hono runs Start, so the server and plugins stay unbundled on Node's type stripping.

- **Production.** `vite build` writes `apps/web/dist/client` and `apps/web/dist/server/server.js`, whose default export is a fetch handler. Hono answers `/api`, `/oauth`, `/oauth-client-metadata.json`, `/xrpc`, and `/.well-known` first, then serves files from `dist/client`, then passes every other request to Start's handler.
- **Development.** The same server entry creates Vite in middleware mode on the server's HTTP server, so HMR shares its port. Each request goes through Vite's middlewares first, which serve modules and call on for everything else. Pages go to Start's server entry, which the server imports through Vite's SSR runner on each request, so web edits apply without a restart. `pnpm dev` runs one process on one port, with no proxy.
- **Request context.** Hono passes Start a context holding the configured app name and a `fetch` that calls the Hono app in process, resolving paths against the page request and sending its cookie. During server rendering, the typed client in `api.ts` calls the API through that `fetch`, found with Start's `getGlobalStartContext`, and in the browser it uses the browser's `fetch`. The root route reads the app name from the context for the page title and `application-name` meta tag.
- `@tanstack/react-start` is pinned to an exact version, since the dev setup imports Start's server entry by its internal virtual module ID, `virtual:tanstack-start-server-entry`, as Start's own dev middleware does.

### Data

- **Server data.** Query wraps every typed-client call, keyed by route, such as `['models']` or `['preferences']`, from the factories in each feature's `queries.ts`. Writes are mutations that invalidate the keys they change. A 401 from any call ends the session as before. Queries do not retry or refetch on window focus, so failures show at once, as they did before Query. Admin data is keyed under `['admin']`, such as `['admin', 'roles']`, and the users list is an infinite query, `['admin', 'users', q]`, paged by the server's cursor.
- **Chats.** The chat list is the query `['conversations']`, a conversation is `['conversation', skey]`, and a search is `['search', q]`, all read from the browser store's worker. `StoreProvider` turns the store's change events into invalidations: an `index` change invalidates the chat list, a `conversation` change invalidates that conversation, and any change invalidates searches. Queries wait while the store is held by another tab. Opening a conversation also refreshes it from the PDS through the query `['conversation', skey, 'refresh']`, whose changes come back as store events.
- **URL state.** On a conversation, and on a shared conversation, `m` names a focused message, and the branch on screen is its ancestors, then the newest sibling at each level below it. Choosing a sibling, regenerating, or editing replaces `m` with the chosen message, so the URL always names the branch on screen, and reloading or sharing the link keeps it. On every chat route, `q` holds the sidebar search: the box starts from it, and the search goes back into it once typing pauses. The chat layout validates `q` and keeps it on every navigation between chat routes with the router's `retainSearchParams`, so opening a result, another chat, or a new chat keeps the search until it is cleared. On `/admin/users`, `q` holds the users search, set when the search is submitted. Changes to `m` and `q` replace the history entry rather than adding one, and the routes validate them in `src/shared/search-params.ts`.

### Routes

| Route | Screen | Server-rendered |
|---|---|---|
| `/login` | A handle field and a sign-in button that goes to `/oauth/login` | Yes |
| `/` | Chat list sidebar, and a new chat | No |
| `/chat/:skey` | Chat list sidebar and a conversation | No |
| `/shared/:ownerDid/:skey` | A shared conversation, read-only | No |
| `/settings` | Preferences, with a sidebar linking to each settings section | Yes |
| `/settings/api-keys`, `/settings/plugins`, `/settings/sync` | The other settings sections | Yes |
| `/admin` | Redirects to `/admin/users` | Yes |
| `/admin/users`, `/admin/roles`, `/admin/access` | The admin area's people sections, from the admin spec | Yes |
| `/admin/plugins`, `/admin/plugins/new`, `/admin/plugins/:id`, `/admin/models` | Plugins and models, from the admin-plugins spec | Yes |
| `/admin/general`, `/admin/turns`, `/admin/sync` | The app's settings, from the admin-settings spec | Yes |

The root route's `beforeLoad` asks `/api/me` who is signed in, through the query cache, so on the server the answer reaches the browser with the page. A 401 means signed out, and any other failure shows the root's error. The signed-in routes share the layout `_app`, whose `beforeLoad` redirects signed-out requests to `/login`, so the server answers them with a redirect before rendering anything. It redirects viewers, who may only open shared chats, to `/login` too, where they see the server's access message above the sign-in form, with a sign-out button. `/login` redirects other signed-in users to `/`. Inside `_app`, the chat routes share a client-only layout, `_app/_chats`, which opens the browser store, since chats live there. The settings routes are server-rendered, and each prefetches its section's queries in its loader, so the section renders with its data. They open the browser store only for an action that needs it, signing out or rebuilding the device's copy. The admin routes share the layout `_app/admin`, whose `beforeLoad` redirects users who are not admins to `/`. They are server-rendered and prefetch in their loaders like the settings routes, and never open the browser store. A shared route shows a sign-in prompt instead of redirecting.

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
- **Message actions.** On user messages, edit, which opens the composer prefilled and sends a sibling. Editing another message starts the composer over from that message. On assistant replies, regenerate, with an optional model change chosen for that reply alone. While generating, stop.
- **Composer.** A textarea, a model select from `/api/models`, an effort select for models with the reasoning capability, and an attach button. The effort is sent only while its select is shown. The attach button accepts images only for models with vision, plus any type an ingester supports. Attachments upload when chosen and show a progress state. Enter sends, and Shift+Enter adds a newline. The model select offers "Default model" only when the server can choose a model without one, following chat-turns: an earlier completed reply on the branch names a model, or the user's preferences or the admin set a default. Otherwise the composer asks for a model, and sending waits until one is chosen.
- **Settings.** A sidebar links back to the chats, to the admin area for admins, and to each section, marks the current one, and holds sign out. Only the current section is shown.
  - Preferences: default model, default effort, custom instructions, and generate titles. Saving also stores the browser's time zone, which the app saves on sign-in as well when it differs from the stored one. A stored default model the model list no longer offers, as after its key is deleted, shows as unavailable and is kept on save until the user picks another.
  - API keys: add, list with the last four characters, and delete. For providers with user endpoints, a base URL field.
  - Plugins: one form with a group per plugin and a single Save at the end, which saves every plugin's settings and any tool switches that changed. A group has a checkbox for each tool the user may switch, labeled "Enabled" when it is the plugin's only one and by tool name otherwise, then the fields generated from the plugin's JSON schema. When no plugin has settings or switches for the user, the section says so rather than showing nothing.
  - Sync: the background sync switch, shown only when the admin allows users to opt out, and a button that deletes and rebuilds the browser store.
- **Admin.** The admin specs describe each section. `features/admin/pages/` mirrors `features/settings/pages/`: a layout for the sidebar, which links back to the chats and to the account settings and marks the current section, a plugin's page counting as Plugins, and one file per section. A form that edits stored values starts from them, and starts over when they change after a save. A failed save shows its message, and the field issues the server returns show beside their fields.

### Schema forms

`SchemaFields` renders one plugin's settings, a JSON schema object, as labeled inputs, reporting each change to its parent. The plugin form binds each plugin's settings object as one TanStack Form field, and each switchable tool as another. It supports strings, as text inputs or password inputs for secret fields, plus numbers, booleans as checkboxes, and string enums as selects. Any other type is shown as unsupported, not guessed at. A field's schema may carry a [JSON Forms rule](https://jsonforms.io/docs/uischema/rules) under `rule`, whose effect is `SHOW`, `HIDE`, `ENABLE`, or `DISABLE`. Its condition names another top-level field as `#/properties/<name>` and tests that field's value with a JSON Schema limited to `const`, `enum`, `not`, and `minLength`, honoring `failWhenUndefined`. A rule with any other scope, keyword, or effect is ignored with a console warning, so the field stays shown and enabled.

### Streaming

Each pending reply in the open conversation has a stream query, `['reply-stream', skey, rkey]`, over the reply's stream endpoint. A reply just sent or regenerated is followed at once, before its pending record reaches the browser store. The query reduces the stream's events into the reply's streamed text and reasoning, and ends after the `status` event. A finished status (`complete`, `error`, or `cancelled`) refreshes the conversation from the PDS, which brings the final record into the browser store. A stream runs once while the conversation is open. Leaving the conversation drops it, and coming back follows the reply again.

The conversation starts each stream but follows it only to learn when it ends. A pending message shows its stream through `ReplyStream`, which `ConversationView` puts in `MessageView`'s `pending` slot. `ReplyStream` reads the stream query with fetching disabled, so it never starts a stream itself, and each delta re-renders that reply alone rather than the conversation. A message with nothing in the slot, as on the shared page, shows "Thinking..." while pending.

If a reply is still pending after its stream ends, because the stream dropped or the status says another server runs it, a poll query refreshes the conversation from the PDS with a backoff from two seconds to thirty until the reply leaves `pending`. The first poll comes one interval after the stream ends, and polling continues while the tab is in the background.

While the reader is at the bottom of the conversation, it stays scrolled to the bottom as replies stream and messages arrive. Once they scroll up it stops following, until they scroll back down or send a message, which always scrolls to the bottom. A conversation opened on a linked message scrolls to that message instead. Switching siblings does not scroll.

## Scope Boundaries

- No visual design, theming, dark mode beyond the stand-in stylesheet, icons, or animations. Those belong to the styling spec.
- No table of part views or forker guide. Those belong to the extending spec.
- No server rendering of chat or shared routes.
- No code highlighting.
- No PWA, offline support, or notifications.
- No mobile-specific layout beyond what the browser does.

## Edge Cases and Decisions

- The Markdown renderer builds React elements rather than injecting HTML, so it needs no separate sanitizer. A theme may restyle it.
- The typed Hono client comes from the server's route types, so the web app and server share one definition of the API. On the server it calls the Hono app in process, and in the browser it uses `fetch`, so there is one client for both.
- The web app never imports server code. Start reaches Hono only through the request context, so the server never enters Vite's module graph or reloads on HMR.
- In development the server imports Start's server entry itself rather than letting Start install its dev middleware, because that middleware calls the entry without a request context.
- Vite loads its config through its module runner. The default loader imports a temporary bundle of the config, which `node --watch` sees and restarts on in a loop.
- With no `index.html`, Vite's dependency scan starts from the route files. Otherwise a dependency first seen when a split route loads makes Vite re-optimize mid-load, and that route fails to import.
- Unknown paths get a 404 from the server, and the client then redirects them to `/`.
- Chats are never server-rendered. Doing so would read the conversation from the PDS on every navigation and duplicate the browser store.
- The settings routes do not open the browser store just by rendering, so a settings tab does not take the store from a chat tab. `useOpenStore` gives them the provided store, as in tests, or opens it when the action runs.
- `api.ts` checks for a window before asking Start for the request context. Outside Start's compiler, as in tests, that lookup always takes its server branch.
- In-process calls only read, and the session cookie is only set at login, so responses from them have no cookies to pass on to the browser.
- The login page reads `error` and `next` from validated search params, since there is no `location` on the server.
- The default branch is the newest sibling at each level, matching how ChatGPT shows the latest regeneration.
- `m` keeps the name search links already used. One focused message is enough to name a branch, since its ancestors are fixed and everything below it follows the newest sibling. So choosing a sibling high in the conversation resets the levels below it to their newest, rather than remembering earlier choices there.
- Opening a conversation with `m`, from a link or a reload, scrolls to that message. Choosing a message on screen does not, so switching siblings keeps the reader's place.
- The router parses search values as JSON, so the validators turn a number back into text, as for a search of `2024`.
- The store's search hook is `useChatSearch`, apart from the router's `useSearch`.
- Write routes read JSON without validators, so the typed client sends bodies through its request options. Response types still come from the server's routes.
- The `read` helper returns the body of the successful responses and throws an `ApiError` with the server's message otherwise.
- Where a screen shows one error for several actions, it shows the error of the action that ran last, so a later success clears an earlier failure.
- Each form starts from the stored values once they load. Submitting runs a mutation, which holds any error for display, so submitting never rejects. The preferences form saves the stored record with its own fields changed, so fields it does not show, like the time zone, are kept.
- The plugin form addresses fields by position, as `plugins[i].values` and `plugins[i].tools[j]`, since tool names and setting keys are the plugins' own and may contain the dots TanStack Form uses in field paths. For the same reason a plugin's settings are one field rather than one per setting.
- The forms check nothing beyond required inputs. The server validates every save against the plugin's or the record's schema and returns the error to show.
- Invalidating a conversation is exact, so its own refresh query, which causes those invalidations, does not rerun in a loop.
- Adding or deleting an API key also invalidates the model list, since a user's keys add their own models.
- A pending reply keeps showing its streamed text after its stream drops, until the final record arrives, instead of going back to "Thinking...".
- Each wait on the same replies is its own poll query, keyed by the replies waited on, so the backoff starts over for each new wait.
- Shared links show a sign-in prompt when signed out, and every other route sends signed-out users to `/login`.
- Viewers go to `/login` rather than seeing the access message on every route, so the server answers with a redirect before rendering, as it does for signed-out users, and the chat routes never open a store for an account without access. Signing a viewer out deletes nothing, since they have no chats on the device.
- The admin forms send what the form holds and leave validation to the server, like the settings forms. The server's 400 carries `issues` with field paths, which `ApiError` keeps, so `SchemaFields` can show each one beside its field.
- The General, Turns, and Sync sections save their groups one at a time, so a failure names the group whose fields its issues belong to.
- A change to a plugin rebuilds the server's plugins, so it invalidates the admin's plugins and models, and the admin's own models, providers, plugin settings, and attachment types. A change to an admin model invalidates the admin models and the model list.

## Acceptance Criteria

- [ ] Signing in with a handle starts OAuth, and the app returns to the chat list afterwards.
- [x] Signed-out users requesting a signed-in route get a redirect to `/login` from the server, before any page is rendered.
- [ ] `pnpm dev` serves the API and the web app from one process and port, and a production build serves both from the server entry.
- [ ] Creating a chat, sending a message, and watching the reply stream works end to end.
- [ ] The chat list shows new titles once they are generated.
- [x] Sibling controls switch branches and show the matching replies, and reloading the page keeps the chosen branch.
- [x] Reloading during a search keeps the search and its results.
- [x] Regenerating adds a sibling reply and selects it.
- [x] Editing a message adds a sibling user message with its own reply, and switching the edit to another message starts over from its text.
- [x] Stop cancels a generating reply, which then shows as stopped.
- [x] The effort select appears only for reasoning models, and a hidden effort is not sent.
- [x] With no default model anywhere, a new chat asks for a model instead of failing with "No model selected".
- [x] Image attachment is disabled for models without vision.
- [x] A PDF attachment uploads, shows its name, and reaches the model as text.
- [x] Settings save preferences, add and delete API keys, and save plugin settings through generated forms.
- [x] A shared link shows the conversation read-only to a permitted viewer.
- [x] Reasoning and tool details are collapsed by default.
- [x] Assistant text renders as Markdown, raw HTML in it is not rendered, images in it load only on click and show their full URL first, and user text stays plain.
- [x] If the stream drops, the reply still appears through repeated refreshes.
- [x] The conversation follows a streaming reply while the reader is at the bottom, not after they scroll up, and scrolls to the bottom on send.
- [x] The sync button syncs the conversation and shows changes written from another client.
- [x] The background sync switch appears only when the admin allows opting out, and saves the account setting.
- [x] The page title and `application-name` meta tag show the configured app name.
- [x] A viewer requesting a chat or settings route is redirected to `/login`, which shows the access message, sign-in, and sign-out, and a shared link still opens for them.
- [x] A user who is not an admin requesting an admin route gets a redirect to `/` from the server.
- [x] `/admin` opens on the users section, and the users search is kept in the URL.
