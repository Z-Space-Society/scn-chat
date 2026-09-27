# Browser Store

## Summary

The web app keeps a local copy of the signed-in user's chats in the browser, in SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`), stored in the browser's origin private file system. The chat list, open conversations, and search all read from this local database. It syncs with the user's PDS through the server's pass-through routes, fetching only changes since the revisions it last saw. The copy lives on the user's device, so the server never holds chat content, and the UI stays fast without a server cache.

## Motivation

The PDS is the source of truth, and the server keeps no copy of chat content. Reading everything from the PDS on every screen would be slow, and full-text search over hundreds of conversations is impossible without an index. Keeping the copy and the index on the user's own device gives both, while leaving the server stateless about content. SQLite with FTS5 gives real search and a familiar SQL model in the browser.

## Design

### Runtime

- `@sqlite.org/sqlite-wasm` runs in a dedicated Web Worker, using the `opfs-sahpool` VFS. That VFS persists to the origin private file system without the cross-origin isolation headers the other OPFS mode needs.
- The UI talks to the worker through `comlink`, which exposes the worker's functions as async calls.
- There is one database file per account, named from a hash of the DID, so accounts on a shared browser stay separate.
- Signing out deletes that account's database file. So does any 401 from the server, which means the session has lapsed, so chats are not left on a shared device after an expired session. The data is on the PDS, so a later sign-in resyncs it.
- `opfs-sahpool` allows only one open connection per database, so only one tab holds the store at a time, and it moves to whichever tab the user is working in:
  - When a tab gains focus, it requests a Web Lock named after the database with `steal: true`, and posts a release request on a `BroadcastChannel`.
  - The tab losing the lock finishes any running transaction, closes its database with SQLite's `pauseVfs`, and keeps showing what it last rendered. Reply streams still reach it, since they come from the server. It reopens the store when it is focused again.
  - The focused tab retries opening the database for up to three seconds, since the old tab may need a moment to release its file handles.
  - If the open still fails, most likely because the browser has frozen the other tab and it cannot release its handles, the tab shows a banner saying SCN Chat is busy in another tab, with a "use here" button that retries. It keeps showing what it last rendered meanwhile.
  - Opening the database either succeeds or throws, so a tab always knows whether it holds the store, and two tabs never hold it at once.
- If the origin private file system is unavailable, as in some private browsing modes, the worker uses an in-memory database and logs a warning. Everything works, but nothing persists between sessions.

### Schema

| Table | Columns |
|---|---|
| `conversation` | `skey` (primary key), `uri`, `title`, `tags_json`, `updated_at`, `rev` (the last conversation revision fetched, null if never fetched) |
| `message` | `conversation_skey`, `author_did`, `rkey`, `role`, `parent`, `status`, `record_json`, `text`, `created_at`. Primary key is the first three. |
| `info` | `conversation_skey` (primary key), `record_json` |
| `meta` | `key` (primary key), `value`. Holds the index revision and the schema version. |

`text` is the concatenated text parts of a message, used by search. The schema version is checked on open. A mismatch deletes and rebuilds the database, since everything in it can be fetched again.

### Sync

- **The index.** On start, and whenever the server's event stream says the index changed, the worker calls `GET /api/conversations?since=<index revision>`. It applies the returned entries and deletions to `conversation`, and stores the new revision. The first call has no revision and returns the whole index.
- **Conversations.** A conversation is fetched with `GET /api/conversations/:skey?since=<rev>`, applying changed records and deletions and storing the new revision. The first fetch of a conversation has no revision and returns everything.
- **Opening a conversation** fetches its changes before showing it, and shows the local copy immediately while that runs.
- **Background download.** After the index syncs, the worker fetches every conversation it has never fetched, newest first, two at a time, so search eventually covers the whole history. A conversation whose `updated_at` is newer than when it was last fetched is refetched the same way.
- **Live changes.** The worker subscribes to `GET /api/events`. A `conversation-changed` event fetches that conversation's changes, and an `index-changed` event syncs the index.
- **Own writes.** After the UI writes through the server, the worker fetches the affected conversation's changes, so the local copy matches the PDS.
- **Reconciling.** At startup for the index, and when a conversation is opened, the worker fetches the matching keys route from the chat-storage spec. It compares every collection, key, and CID with its own rows, fetches records it lacks or holds at a different CID, and deletes rows the PDS no longer has. That repairs any gap in the revision-based fetches without downloading content it already has.

Streaming replies are shown from the turn's stream, as the chat-turns spec describes. The finished record arrives through a normal changes fetch.

### Worker API

```ts
listConversations(): Promise<ConversationSummary[]>
getConversation(skey): Promise<{ info; messages }>
refreshConversation(skey): Promise<void>
syncIndex(): Promise<void>
search(query, opts): Promise<SearchResult[]>   // see the search spec
reset(): Promise<void>                          // delete and rebuild the database
```

Changes are announced to the UI through a subscription, so screens rerender when the data under them changes.

## Scope Boundaries

- No writes to the local database from the UI. All writes go through the server to the PDS, and the local copy follows.
- No offline writing or queueing.
- No sync between devices other than through the PDS.
- No local copy of shared conversations owned by other people.
- No encryption of the local database beyond what the browser provides.

## Edge Cases and Decisions

- The local database is disposable. A schema change or a reset rebuilds it from the PDS, so it never needs migrations.
- Signing out deletes the local copy, trading a resync on next sign-in for not leaving chats on a shared device.
- Search only covers conversations the background download has fetched, so a new device's search fills in over the first minutes.
- `opfs-sahpool` avoids the cross-origin isolation headers, which would break embedding and some third-party resources. The cost is one connection at a time, handled by moving the store to the focused tab.
- The handover cannot be guaranteed, because a frozen background tab cannot release its file handles. The banner covers that case.
- The local tables also keep each record's CID, each index entry's CID, and when each conversation was last fetched. Reconciling compares CIDs, and the background download refetches conversations whose entry is newer than their last fetch.
- Reconciling refetches the whole conversation, or the whole index, when anything differs, since the server has no per-record route.
- The store logic runs over a small SQL interface, so tests run it on better-sqlite3 while the worker runs it on SQLite WebAssembly.
- The worker, OPFS persistence, and reload survival need a real browser, so they are not covered by the jsdom tests.

## Acceptance Criteria

- [ ] The first sync fetches the whole index and stores its revision.
- [ ] Later syncs fetch only changes since the stored revision, including deletions.
- [ ] Opening a conversation shows the local copy, then applies fetched changes.
- [ ] The background download fetches every unfetched conversation, newest first, at most two at a time.
- [ ] A `conversation-changed` event fetches that conversation's changes.
- [ ] After a write through the server, the local copy shows the written record.
- [ ] Two accounts in the same browser get separate databases.
- [ ] Signing out deletes the account's database.
- [ ] A 401 from the server deletes the account's database.
- [ ] Focusing another tab moves the store to it without any notice.
- [ ] The tab that lost the store keeps its screen, and reopens the store when focused again.
- [ ] When the store cannot be opened within three seconds, the tab shows the busy banner, and "use here" retries.
- [ ] Two tabs never hold the store at once.
- [ ] Reconciling fetches missing or changed records and deletes records the PDS no longer has.
- [ ] A schema version mismatch rebuilds the database.
- [ ] Without the origin private file system, the store works in memory.
- [ ] The database survives a page reload.
