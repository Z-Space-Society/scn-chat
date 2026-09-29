# Architecture

This document describes the SCN Chat architecture at a high level. Each feature has an LLM written and maintained spec in [`specs/`](../specs/README.md) describing its behavior and any decisions made.

## The founding principle

This in an AI assistant chat app that uses the users' spaces-enabled PDS as a source of truth for their chat history. Due to the alpha nature of spaces the app will also store the chat history in its own database. This feature will be removed when spaces are in widespread production use.

## Chat history storage

The goal is to keep users in control of their own chat data. The server should not keep a copy of the chat records. The records are stored in the browser in a wasm sqlite db to allow easy listing and search without having to perform intensive operations on the PDS.

- **The user's PDS:** If the user is on a space-enabled PDS all data is stored directly on their pds in `network.sharedcomputer.chat.*` records. Conversations in `network.sharedcomputer.chat.conversation`, settings in `network.sharedcomputer.chat.settings`. See [`lexicons/README.md`](../lexicons/README.md).
- **The server's database:** If a user is on standard PDS without spaces support all private data (conversations, settings, etc) is stored in a local database (SQLite and Postgres are supported).
- **The browser:** For all users a wasm-based SQLite db stores the chat history in the users' browser. This is primarily for the chat listing, active conversation history, and search. When using the chat interface in multiple tabs switching tabs causes the new tab to get a lock on the DB from the previous tab. See [specs/browser-store.md](../specs/browser-store.md).

## Sending a message

1. The web app posts the message to `POST /api/conversations/:skey/messages` (`apps/server/src/turns/routes.ts`).
2. The server writes the user's `message` record to the PDS and asks for a reply by setting the `generation` field.
3. When the server sees the request, it writes a `pending` AI-assistant record with a key derived from the user message to prevent two servers or two tabs answering the same request.
4. The task runner sends the reply as a stream using the [Vercel AI SDK](https://github.com/vercel/ai). Nothing is written to the PDS until the assistant response is streaming.
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

### Choosing the storage mode

The storage type is chosen on first login and currently cannot be changed. So if a user switches away from a spaces-enabled PDS they'll lose access to the system.

- **Detection:** Login always asks for space permissions (ignored by PDS's that don't support spaces). On login the server checks for if scope was granted to create a space and that answer decides if the user gest a `local` or `spaces` data store.
- **Migration:** Moving chats between local storage and spaces is a future feature. Local records keep the same structure that a PDS would give them, so moving them to spaces should be a replay.

See [specs/auth.md](../specs/auth.md).

## Plugins

The system is built to support custom model providers, tools, file ingesters, and support a hook system. These are configured in `config.yml` and loaded startup. See [plugins.md](plugins.md).
