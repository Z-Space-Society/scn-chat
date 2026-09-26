# SCN Chat

An AI assistant chat app where each conversation is an atproto permissioned space on the user's own PDS. Only the lexicons exist so far. There is no build, test, or app code yet.

## Architecture decisions

These are settled. Raise a concern before working against any of them.

- Every record belongs to the user, including the assistant's replies. The app never has its own PDS account and never writes records under its own DID.
- One space per conversation, of type `network.sharedcomputer.chat.conversation`. Sharing a chat means changing that space's read policy.
- There is no public HTTP API. The user's PDS is the API: a client can hold a whole conversation by writing records directly. The conventions for that are in `lexicons/README.md`, and the server must honor them exactly.
- Users whose PDS does not support spaces fall back to local storage in SQLite or Postgres. Keep this behind one storage interface so it can be deleted once PDSs support spaces. Local rows store the exact lexicon record JSON under the same space and record keys, so migrating a user to their PDS is a replay.
- BYO API keys are stored encrypted in the app database, never in records.
- Providers, tools, file ingesters, and turn hooks are plugins. Web search, fetch, and image generation are plugins, not core.
- The project is meant to be forked. Code refers to lexicon NSIDs only through one generated module, and app name, URLs, OAuth metadata, and admin models come from environment config.

## Planned stack

TypeScript throughout, as a pnpm workspace on Node 22 or newer. Hono server with server-sent events for streaming. Kysely over SQLite and Postgres. Vite and React for the frontend, with no framework on top. Vitest for tests.

The web UI must stay barebones with minimal code and styling. A separate designer will build the real interface on top of it.

## Lexicons

- Lexicons live in `lexicons/network/sharedcomputer/chat/`. Once published, only add optional fields, new union members, or new record types. Never rename, remove, or tighten anything.
- The atproto data model has no floats. Anything that may contain them, like tool arguments, is stored as a JSON-encoded string.
- Under encryption, user-written content goes inside `encryptedContent` and metadata stays in the clear.
- Assume readers of lexicon descriptions are atproto experts. Descriptions only state conventions specific to this app.

## atproto spaces alpha

- The spaces SDK is the `@atproto/*` packages at `0.0.0-spaces-alpha-*` versions. Pin exact versions, since breaking changes land without notice.
- These packages only install with pnpm. `@atproto/lex-data` must be overridden to a stable release (`^0.1.7`), because the alpha versions resolve it to a broken build.
- Reference material: the permissioned data proposal (`bluesky-social/proposals`, `0016-permissioned-data`), the `permissioned-data-alpha` branch of `bluesky-social/atproto`, and the `bluesky-social/bulletin` example app.

## Server build-out notes

- To see writes it did not make, the server calls `registerNotify` on each conversation space and renews it before it expires. That needs a did:web identity for the app and inbound XRPC routes for `notifyWrite` and `notifySpaceDeleted`, as in bulletin. Notifications are best-effort, so also poll `listRepoOps` from a stored revision per conversation.
- A PDS without spaces rejects the space permissions. Login needs two scope sets and a check for spaces support before the OAuth request.
- Write the conversation's `info` record when creating the space. `listSpaces` only returns spaces the user has written to, so an empty conversation would be invisible.
- The alpha PDS caps a write request at 1 MB. Large tool output, like a fetched page, goes into a blob instead of the record.
- New record types must be added to both the space declaration and the permission set, and every user then has to re-authorize. Batch them.
- Blobs in spaces are private on the reference PDS. Verify that on any other PDS implementation before relying on it.
