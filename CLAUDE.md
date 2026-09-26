# SCN Chat

An AI assistant chat app where each conversation is an atproto permissioned space on the user's own PDS. Only the lexicons exist so far. There is no build, test, or app code yet.

## The founding principle

The user's PDS is the source of truth for every chat. This is the reason the project exists. The server holds no copy of chat content for spaces users: no message tables, no caches that outlive a request, no search index. It reads from the PDS when it needs data, and it keeps only what it needs to operate, such as sessions, sync cursors, reply claims, and encrypted API keys. The local database fallback is a temporary stand-in for a PDS while spaces are in alpha, shaped like a PDS so it can be deleted later. Any design that makes the server a second source of truth, even as a cache, is wrong.

## Architecture decisions

These are settled. Raise a concern before working against any of them.

- Every record belongs to the user, including the assistant's replies. The running app never writes records under its own DID. The one exception is publishing the lexicons, which the maintainers do from a lexicon authority account, outside the app.
- One space per conversation, of type `network.sharedcomputer.chat.conversation`. Sharing a chat means changing that space's read policy. Fallback users cannot share or view shared chats.
- There is no public HTTP API, apart from XRPC procedures defined in our own lexicons, currently `requestSync`. The user's PDS is the API: a client can hold a whole conversation by writing records directly. The conventions for that are in `lexicons/README.md`, and the server must honor them exactly.
- Users whose PDS does not support spaces fall back to local storage in SQLite or Postgres. It sits behind the same PDS-shaped record interface as the spaces backend, so it can be deleted once PDSs support spaces. Local rows store the exact lexicon record JSON under the same space and record keys, so migrating a user to their PDS is a replay.
- Each conversation has an entry record in the user's settings space. Together the entries are the user's chat index, which is how the server and browser find conversations and notice changes with one call per user.
- The browser keeps its own local copy of the user's chats in SQLite compiled to WebAssembly, for the chat list, the open conversation, and search. That copy lives on the user's device, not on the server.
- BYO API keys are stored encrypted in the app database, never in records.
- Providers, tools, file ingesters, and turn hooks are plugins. Web search, fetch, and image generation are plugins, not core.
- The project is meant to be forked. Code refers to lexicon NSIDs only through one generated module, and app name, URLs, OAuth metadata, and admin models come from environment config.

## Planned stack

TypeScript throughout, as a pnpm workspace on Node 24 LTS, run natively with Node's type stripping and no compile step. Hono server with server-sent events for streaming. Kysely over SQLite and Postgres. Vite and React for the frontend, with no framework on top. Vitest for tests. Provider plugins use the Vercel AI SDK internally, behind our own plugin interface.

Prefer existing libraries over writing our own, especially the official `@atproto/*` packages for anything protocol related. Dependencies must have licenses compatible with MIT.

Admins, their global models, and roles are configured through environment config and a config file in phase 1. Roles gate which admin models a user may use. There is no admin UI yet.

The web UI must stay barebones with minimal code and styling. A separate designer will build the real interface on top of it.

## Lexicons

- Lexicons live in `lexicons/network/sharedcomputer/chat/`. Once published, only add optional fields, new union members, or new record types. Never rename, remove, or tighten anything.
- The atproto data model has no floats. Anything that may contain them, like tool arguments, is stored as a JSON-encoded string.
- Under encryption, user-written content goes inside `encryptedContent` and metadata stays in the clear.
- Assume readers of lexicon descriptions are atproto experts. Descriptions only state conventions specific to this app.

## atproto spaces alpha

- The spaces SDK is the `@atproto/*` packages at `0.0.0-spaces-alpha-*` versions. Pin exact versions, since breaking changes land without notice.
- These packages only install with pnpm. Every `@atproto/*` package with an alpha release must be pinned to the exact same alpha version through `pnpm.overrides`. A range like `^0.0.0-spaces-alpha-*` also matches the plain `0.0.0` releases, which were published broken.
- Reference material: the permissioned data proposal (`bluesky-social/proposals`, `0016-permissioned-data`), the `permissioned-data-alpha` branch of `bluesky-social/atproto`, and the `bluesky-social/bulletin` example app.

## Server build-out notes

- To see writes it did not make, the server calls `registerNotify` on each user's settings space, which holds the chat index, and renews it before its one-day expiry. `registerNotify` only accepts a space credential, even for the owner's own space. It also needs a did:web identity for the app and inbound XRPC routes for `notifyWrite` and `notifySpaceDeleted`, as in bulletin. A did:web on a loopback URL cannot be resolved by a PDS, so notifications never arrive in local development. There, sync relies on the safety net, the sync button, and opening a chat.
- A PDS without spaces silently drops space permissions and login still succeeds. Detect spaces support after login from the granted scope, and fall back to local storage when the space permissions are missing.
- The OAuth client must be confidential (`private_key_jwt` with a keyset). Public clients get two-week sessions, and the server needs long-lived sessions to write replies in the background.
- Write the conversation's `info` record when creating the space. `listSpaces` only returns spaces the user has written to, so an empty conversation would be invisible.
- The alpha PDS caps a write request at 1 MB, and `putRecord` has no compare-and-swap. Use `createRecord` with an explicit key and catch `RecordAlreadyExists` when a write must not clobber. Large tool output, like a fetched page, goes into a blob instead of the record.
- New record types must be added to both the space declaration and the permission set. Existing sessions pick up changes to the same permission set on token refresh, but a new permission set NSID needs a fresh login.
- Blobs in spaces are private on the reference PDS. Verify that on any other PDS implementation before relying on it.
