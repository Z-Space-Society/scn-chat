# Web UI

## Summary

The web UI is a deliberately bare React app. It exposes every phase 1 feature with plain HTML elements and almost no styling, so a designer can build the real interface on top without fighting existing design decisions. It covers signing in, the chat list, a conversation with branch navigation, the composer with model and effort choice and attachments, streaming replies, sharing, and settings for preferences, API keys, and plugin settings. It talks to the server through Hono's typed client, so API changes surface as type errors.

## Motivation

A separate designer will build the production interface. The phase 1 UI exists to prove the features work end to end, and to give the designer working components and data flow to restyle or replace. Every visual choice made here is one the designer might have to undo, so this UI makes as few as possible.

## Design

### Stack

- React with Vite, from the foundation spec.
- `wouter` for routing, a router of about 2 KB.
- `hono/client`'s `hc` with the server's exported route types, for a typed API client with no hand-written API types.
- Chats are read from the browser store, through its worker API. Writes and other data go through the typed client with small hooks. No state management or data-fetching library.
- `EventSource` for reply streams.
- One small stylesheet for layout only: a sidebar and main column with flexbox, and `white-space: pre-wrap` on message text. No colors, fonts, or component library.

### Routes

| Route | Screen |
|---|---|
| `/login` | A handle field and a sign-in button that goes to `/oauth/login` |
| `/` | Chat list sidebar, and a new chat |
| `/c/:skey` | Chat list sidebar and a conversation |
| `/s/:ownerDid/:skey` | A shared conversation, read-only |
| `/settings` | Preferences, with a sidebar linking to each settings section |
| `/settings/api-keys`, `/settings/plugins`, `/settings/sync` | The other settings sections |
| `/admin` and its sections | The admin area, for admins, from the admin specs |

Any route except `/login` and a shared route redirects to `/login` when `/api/me` returns 401. A shared route shows a sign-in prompt instead. A viewer, signed in only to view shared chats, sees the access message with sign-in and sign-out on every route except shared chats.

### Components

- **ChatList.** Conversation titles from the browser store, newest first. Untitled conversations show "New chat". It has a button to start a new chat.
- **Conversation.** It shows the messages on the current branch, from the root to the selected leaf. A message with siblings shows "‹ 2 / 3 ›" controls that switch branches. By default the branch follows the newest sibling at each level. It also has the title, with rename, the share control from the sharing spec, and a sync button that calls the conversation's sync route and then refreshes it in the browser store.
- **Message.**
  - Assistant text parts, including streamed text, are rendered as GitHub-flavored Markdown with `react-markdown` and `remark-gfm`. Raw HTML is not rendered, links open in a new tab, and images show their alt text, full URL, and a load button instead of loading, so injected content cannot leak the chat through an image URL without the user choosing to load it. User text is shown as plain text.
  - Reasoning parts go in a closed `<details>`.
  - Tool calls and results go in a `<details>` with their JSON.
  - Sources are shown as a list of links.
  - Images are shown inline, and files as their names.
  - A pending reply shows streamed text as it arrives. An errored reply shows its error, and a cancelled reply is labeled as stopped.
- **Message actions.** On user messages, edit, which opens the composer prefilled and sends a sibling. On assistant replies, regenerate, with an optional model change. While generating, stop.
- **Composer.** A textarea, a model select from `/api/models`, an effort select for models with the reasoning capability, and an attach button. The attach button accepts images only for models with vision, plus any type an ingester supports. Attachments upload when chosen and show a progress state. Enter sends, and Shift+Enter adds a newline. When `/api/models` lists no models at all, Send is disabled and a note points to Settings to add an API key.
- **Settings.** A sidebar links back to the chats, to the admin area for admins, and to each section, marks the current one, and holds sign out. Only the current section is shown.
  - Preferences: default model, default effort, custom instructions, and generate titles. Saving also stores the browser's time zone, which the app saves on sign-in as well when it differs from the stored one.
  - API keys: add, list with the last four characters, and delete. For providers with user endpoints, a base URL field.
  - Plugins: one form with a group per plugin and a single Save at the end, which saves every plugin's settings and any tool switches that changed. A group has a checkbox for each tool the user may switch, labeled "Enabled" when it is the plugin's only one and by tool name otherwise, then the fields generated from the plugin's JSON schema.
  - Sync: the background sync switch, shown only when the admin allows users to opt out, and a button that deletes and rebuilds the browser store.

### Schema forms

`SchemaFields` renders a JSON schema object as labeled inputs, reporting each change to its parent form. It supports strings, as text inputs or password inputs for secret fields, plus numbers, booleans as checkboxes, and string enums as selects. Any other type is shown as unsupported, not guessed at. A field's schema may carry a [JSON Forms rule](https://jsonforms.io/docs/uischema/rules) under `rule`, whose effect is `SHOW`, `HIDE`, `ENABLE`, or `DISABLE`. Its condition names another top-level field as `#/properties/<name>` and tests that field's value with a JSON Schema limited to `const`, `enum`, `not`, and `minLength`, honoring `failWhenUndefined`. A rule with any other scope, keyword, or effect is ignored with a console warning, so the field stays shown and enabled.

### Streaming

After sending, the conversation subscribes to the reply's stream endpoint and appends deltas to the pending reply. On the `status` event, it asks the browser store to refresh the conversation, which fetches the final record. If the stream fails, it refreshes the conversation every two seconds until the reply leaves `pending`.

While the reader is at the bottom of the conversation, it stays scrolled to the bottom as replies stream and messages arrive. Once they scroll up it stops following, until they scroll back down or send a message, which always scrolls to the bottom. A conversation opened on a linked message scrolls to that message instead.

## Scope Boundaries

- No visual design, theming, dark mode, icons, or animations.
- No code highlighting.
- No PWA, offline support, or notifications.
- No mobile-specific layout beyond what the browser does.
- No search box. That is the search spec.

## Edge Cases and Decisions

- The Markdown renderer builds React elements rather than injecting HTML, so it needs no separate sanitizer. The designer may replace it.
- The typed Hono client comes from the server's route types, so the web app and server share one definition of the API.
- The default branch is the newest sibling at each level, matching how ChatGPT shows the latest regeneration.
- Write routes read JSON without validators, so the typed client sends bodies through its request options. Response types still come from the server's routes.
- The `read` helper returns the body of the successful responses and throws an `ApiError` with the server's message otherwise.
- Shared links show a sign-in prompt when signed out, and every other route sends signed-out users to `/login`.

## Acceptance Criteria

- [ ] Signing in with a handle starts OAuth, and the app returns to the chat list afterwards.
- [ ] Signed-out users are sent to `/login`.
- [ ] Creating a chat, sending a message, and watching the reply stream works end to end.
- [ ] The chat list shows new titles once they are generated.
- [ ] Sibling controls switch branches and show the matching replies.
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
