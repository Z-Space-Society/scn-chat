# Architecture

This document describes the SCN Chat architecture at a high level. Each feature has an LLM written and maintained spec in [`specs/`](../specs/README.md) describing its behavior and any decisions made.

## The founding principle

This in an AI assistant chat app that uses the users' spaces-enabled PDS as a source of truth for their chat history. Due to the alpha nature of spaces the app will also store the chat history in its own database. This feature will be removed when spaces are in widespread production use.

## The web app

The web app uses Hono server, listening on port 3000 by default. It runs [TanStack Start](https://tanstack.com/start) inside of the Hono process. When the app runs on your own machine with a loopback `PUBLIC_URL` and the port is taken, the server moves to the next free port and `PUBLIC_URL` with it. A deployment keeps its port, since a reverse proxy points at it.

Code is grouped by feature in `src/features/`, and `src/routes/` maps each URL to a feature's page.

Each route's loader fetches the server data its page needs, and the page reads it with `useSuspenseQuery`, so a page renders with its data and a failed load shows inside the page's layout with a Retry. Chats are the exception: they come from the browser's local copy in `src/store/`, not from loaders. Features reach that copy only through the store's hooks, such as `useRefreshConversation` and `useSyncIndex`, never its worker. The open conversation is `useChat` in `features/conversation/chat.ts`, shaped like the AI SDK's `useChat` but without a message list of its own: its messages come from the local copy, and the reply follower in `reply-follower.ts` shows each pending reply's stream until its record arrives, rendering at most once a frame however fast the words come. Message parts are drawn by the views in `src/parts/`, looked up by part type, and tool calls by the views in `src/parts/tools/`, looked up by tool name, and `src/shared/` holds what features share, like the form kit in `form.tsx` that every form is built with.

The look comes from one file of design tokens, `src/styles/theme.css`, and each component styles itself with Tailwind utilities that can only name those tokens, since the theme clears Tailwind's own palette and scales. A look used in more than one place is a component in `src/shared/ui/`, such as `Button` or the settings page kit. Light and dark follow the system, or a choice kept on the device in Preferences. Replies render through Streamdown, with code highlighted in the theme's colors. The styling spec has the rules.

## Chat history storage

The goal is to keep users in control of their own chat data. The server should not keep a copy of the chat records. The records are stored in the browser in a wasm sqlite db to allow easy listing and search without having to perform intensive operations on the PDS.

- **The user's PDS:** If the user is on a space-enabled PDS all data is stored directly on their pds in `network.sharedcomputer.chat.*` records. Conversations in `network.sharedcomputer.chat.conversation`, settings in `network.sharedcomputer.chat.settings`. See [`lexicons/README.md`](../lexicons/README.md).
- **The server's database:** If a user is on standard PDS without spaces support all private data (conversations, settings, etc) is stored in a local database (SQLite and Postgres are supported).
- **The browser:** For all users a wasm-based SQLite db stores the chat history in the users' browser. This is primarily for the chat listing, active conversation history, and search. When using the chat interface in multiple tabs switching tabs causes the new tab to get a lock on the DB from the previous tab. See [specs/browser-store.md](../specs/browser-store.md).

## Sending a message

1. The web app posts the message to `POST /api/conversations/:skey/messages` (`apps/server/src/turns/routes.ts`).
2. The route calls the turn runner's `send` (`apps/server/src/turns/runner.ts`), which writes the user's `message` record to the PDS and asks for a reply by setting the `generation` field. The convention every client follows to ask for a reply lives in `turns/request.ts`.
3. When the server sees the request, it writes a `pending` AI-assistant record with a key derived from the user message, `<key>.r<attempt>`, with a create-only call, to prevent two servers or two tabs answering the same request.
4. The runner generates the reply with the [Vercel AI SDK](https://github.com/vercel/ai), smoothed to a word at a time, and streams it to the browser over server-sent events. Nothing more is written to the PDS while it streams.
5. When the model finishes its response it overwrites the pending record with the completed reply. `turn:after` hooks are then run which is where the `titles` plugin can write the chat title.

See [specs/chat-turns.md](../specs/chat-turns.md) for more details.

## Manual PDS writes

We support the PDS being the API itself rather than implementing our own. Any client can write a message with the `generation` flag set and expect a reply.

- **Notifications:** The server registers for write notifications on each user's settings space and receives them at `notifyWrite`. Notifications need a publicly resolvable did:web, so they never arrive in local development.
- **Scheduled checks:** A admin-configurable scheduler periodically re-syncs active users' PDS records. By default, a recent chat syncs each minute, but older chats much less frequently.
- **On demand:** A user can open a chat and hit the `sync` button for an immediate refresh.

See [specs/chat-storage.md](../specs/chat-storage.md).

## Storage and the local fallback

All chat storage is routed through our `RecordStore` interface that's a representation of a spaces-enabled PDS (records keyed by collection and rkey with an op log). We have two implementations:

- `SpaceRecordStore` calls the user's PDS.
- `LocalRecordStore` uses the server's database, for users whose PDS doesn't support spaces.

Blobs, such as attachments and large tool output, follow the same split, with `SpaceBlobStore` and `LocalBlobStore`. Each user's `ChatService` (`apps/server/src/storage/chat-service.ts`) sits on top of their record store and blob store and implements the chat operations, such as creating a conversation or writing a message. `createChatServices` is the one place that picks the spaces or local backends, so removing the fallback means deleting its two adapters and that choice.

### Choosing the storage mode

The storage type is chosen on first login and currently cannot be changed. So if a user switches away from a spaces-enabled PDS they'll lose access to the system.

- **Detection:** Login always asks for space permissions (ignored by PDS's that don't support spaces). On login the server checks for if scope was granted to create a space and that answer decides if the user gest a `local` or `spaces` data store.
- **Migration:** Moving chats between local storage and spaces is a future feature. Local records keep the same structure that a PDS would give them, so moving them to spaces should be a replay.

See [specs/auth.md](../specs/auth.md).

## Settings and the admin area

Configure `.env` before first run. Bootstrap settings and secrets. The rest of the settings, plugins, models, roles, users, etc., can be configured in **Settings** > **Admin**.

Changes in the admin area apply without restarting the server.

## Decisions

The [ADRs](adr/) record the choices a reader might otherwise undo:

- [0001](adr/0001-tanstack-start-inside-hono.md): TanStack Start runs inside the Hono server.
- [0002](adr/0002-web-app-extended-in-code.md): The web app is extended in code, not through plugins.
- [0003](adr/0003-no-chat-library-owns-messages.md): No AI chat library owns message state in the browser.
- [0004](adr/0004-tailwind-with-token-theme.md): Components style themselves with Tailwind, over a theme of tokens.
- [0005](adr/0005-streamdown-with-our-own-elements.md): Replies render through Streamdown, with every element our own.

## Plugins

The system is built to support custom model providers, tools, file ingesters, and support a hook system. Plugins are installed with the server and configured in the admin area. See [plugins.md](plugins.md).
