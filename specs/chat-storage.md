# Chat Storage

## Summary

Chat storage reads and writes a user's conversations, messages, chat index, and preferences. The user's PDS is the source of truth, and the server keeps no copy of chat content. Everything goes through a `RecordStore` interface shaped like a PDS, with two backends: `SpaceRecordStore` calls the user's PDS, and `LocalRecordStore` emulates a PDS in the app database for fallback users. A `ChatService` on top implements chat operations, such as creating a conversation or writing a message, and keeps the chat index in step. Reads pass straight through to the PDS on every request. The server also watches each user's chat index for changes, so a conversation written from any client can get a reply. That watching keeps only cursors, never content.

## Motivation

The founding principle of SCN Chat is that the user's PDS is the source of truth. The server may read and write chat data on the user's behalf, but must never become a second store of it. Shaping the fallback backend like a PDS keeps the rest of the code identical for both kinds of user, and makes the fallback easy to delete later. Watching one chat index per user, instead of every conversation, keeps sync cost proportional to users rather than to conversations.

## Design

### RecordStore

```ts
interface RecordStore {
  createSpace(type: Nsid, skey?: string): Promise<SpaceUri>          // throws SpaceExists
  deleteSpace(space: SpaceUri): Promise<void>
  getRecord(space, collection, rkey): Promise<{ value; cid } | null>
  listRecords(space, collection, opts?: { cursor?; limit? }): Promise<{ records: { rkey; value; cid }[]; cursor? }>
  createRecord(space, collection, rkey, value): Promise<{ cid }>      // throws RecordExists
  putRecord(space, collection, rkey, value): Promise<{ cid }>
  deleteRecord(space, collection, rkey): Promise<void>
  listOps(space, since?: string): Promise<{ ops: Op[]; rev: string }> // pages internally
}
```

`getRecordStore(did)` returns the backend for the account's storage mode. Every write validates the record with the generated lexicon validators first, and throws `InvalidRecord` with the validation message on failure.

**SpaceRecordStore** calls the user's PDS through `getPdsClient(did)`:

- `createSpace` calls `com.atproto.simplespace.createSpace`. Conversations use `readPolicy` and `writePolicy` `#memberListPolicy` and `appAccess` `#open`. `SpaceAlreadyExists` becomes `SpaceExists`.
- Record methods call `com.atproto.space.getRecord`, `listRecords`, `createRecord`, `putRecord`, and `deleteRecord`, with `repo` set to the user's DID and `validate: false`, since our own validation already ran. `RecordAlreadyExists` becomes `RecordExists`.
- `listOps` calls `com.atproto.space.listRepoOps` for the user's own repo and pages until done.

**LocalRecordStore** stores records in three tables:

| Table | Columns |
|---|---|
| `local_space` | `uri` (primary key), `owner_did`, `type`, `skey`, `created_at` |
| `local_record` | `space_uri`, `collection`, `rkey`, `value_json`, `cid`, `updated_at`. Primary key is the first three. |
| `local_op` | `seq` (auto-increment primary key), `space_uri`, `collection`, `rkey`, `cid` (null for deletes), `created_at` |

Local space URIs use the same format as spaces, and record CIDs are computed the way a PDS computes them, with the atproto data libraries. A later migration to a PDS is then a replay of `local_record` with every URI, key, and CID unchanged. `listOps` returns `local_op` rows after the given revision, where the revision is the zero-padded `seq`.

### ChatService

`ChatService` implements chat operations for one user, over their `RecordStore`:

- **Settings space.** At login, it creates the settings space with key `self`, `readPolicy` and `writePolicy` `#memberListPolicy`, and `appAccess` `#open`, treating `SpaceExists` as success.
- **Creating a conversation.** It creates the conversation space, writes the `info` record at key `self`, then writes the conversation's `conversationRef` in the settings space, keyed by the conversation's key, with `updatedAt`.
- **Writing a message.** `createMessage` and `putMessage` write the message, then update the conversation's `conversationRef` with a new `updatedAt`.
- **Updating info.** `updateInfo` reads the info record, applies the patch, and writes it with `putRecord`. With `unlessUserTitled`, it skips the write when the stored `titleSource` is `user`. A title change is copied into the `conversationRef`, since the info record's title is the authoritative one.
- **Tags.** Tags live only in the `conversationRef`, in the owner's private settings space. `setTags` rewrites the entry with the new tags.
- **Deleting a conversation.** It deletes the space, then deletes the `conversationRef`.
- **Preferences.** They are read and written at key `self` in the settings space.

The index update is a second write, so it can fail after the message write succeeds. A failure is logged as a warning, and discovery repairs the index later. `putRecord` has no compare-and-swap, so two clients writing the same conversation at once can overwrite each other's info or index entry. That is a risk the user accepts by writing from several clients.

### Reads

Reads come from the `RecordStore` on every request, with no server-side cache:

- `listConversations(did, since?)` lists every `conversationRef` in the settings space, newest `updatedAt` first. With `since`, it returns only the entries changed after that revision, from `listOps`, including deletions. Either way it returns the settings space's current revision for the next call.
- `getConversation(did, skey, since?)` returns the info record and every message. With `since`, it returns only the records changed after that revision. Either way it returns the conversation's current revision.

The browser keeps its own copy of what it reads, as the browser-store spec describes, and passes the revisions back to fetch only changes.

### Sync

Sync lets the server notice changes it did not make, so chat-turns can answer generation requests written from any client. It applies only to spaces users. Fallback users can only write through the server, which starts turns directly.

The server stores cursors and registration state in a `sync_state` table: space URI (primary key), owner DID, `last_rev`, `registered_until`, `last_synced_at`, and `last_error`. No record content is stored.

**Identity.** The server has a did:web identity derived from `PUBLIC_URL`, for example `did:web:chat.example.com`. It serves `/.well-known/did.json` with one service entry: ID `#scn_chat`, type `AtprotoSpaceService`, endpoint `PUBLIC_URL`. The service identifier is `<did>#scn_chat`.

**Space credentials.** `registerNotify` only accepts a space credential, even from the space's owner. To get one, the server calls `com.atproto.space.getDelegationToken` on the user's PDS, generates an ES256 key with `JoseKey.generate` from `@atproto/jwk-jose`, and posts to `com.atproto.space.getSpaceCredential` on the user's PDS with a DPoP proof from `createDpopProof` in `@atproto/space`. Credentials last two hours and are cached in memory. A call that fails with an auth error discards the credential and retries once with a fresh one.

**Watching the index.** Each spaces user's settings space is registered with `com.atproto.space.registerNotify`, at login and then renewed by a job every five minutes when less than an hour remains. That is one registration per user, whatever their number of conversations. Conversations themselves are not registered.

**Syncing the index.** Syncing a user reads `listOps` on the settings space from its `last_rev`. For each changed `conversationRef`, it syncs that conversation. A deleted `conversationRef` drops the conversation's `sync_state` row.

A user's first index sync, with no `last_rev`, does not sync every conversation. It sets the cursor at the head of the op log, and only syncs, as backfills, the conversations whose entry's `updatedAt` is inside the backfill window from the chat-turns spec. The rest are synced the first time their entry changes. A returning user with thousands of chats therefore costs a handful of calls at login, not thousands.

**Coalescing.** Every message write updates the index, and that write notifies the server back. Syncs are therefore coalesced per user: a sync requested while one is running, or within two seconds of the last one, runs once after it. Ops whose CID matches a record the server itself wrote in the last ten minutes, tracked in memory, emit no events.

**Syncing a conversation.** It reads `listOps` on the conversation from its `last_rev`, advances `last_rev`, and emits a `message:changed` event for each message op. The event carries the conversation, the record, whether it was a create or an update, and whether it is live. It is live when the conversation already had a `last_rev`. It is a backfill when this is the first sync of the conversation, and then the ops cover its whole history. Chat-turns uses that distinction. A record that fails lexicon validation emits a `message:invalid` event instead, with the raw record and the validation error. When an info op carries a title that differs from the `conversationRef`'s copy, the entry is rewritten with the info record's title.

**Detecting gaps.** `listRepoOps` includes the repo's signed commit when a page reaches the head of the log, and the commit's hash is the set hash over every record's collection, key, and CID. The safety net, and the first sync of a conversation, check it. The server lists the space's records with `excludeValues`, which returns those triples without content, rebuilds the set hash with the `@atproto/space` helpers, and verifies the commit. On a mismatch, it resets that space's cursor. The index cursor moves to the head and the entries inside the backfill window are synced, as on a first sync. A conversation's cursor is cleared, so its next sync is a backfill. Either way a warning is logged.

**What starts a sync.**

- A `notifyWrite` for a user's settings space syncs the index.
- `POST /xrpc/network.sharedcomputer.chat.requestSync` syncs the named conversation, or the whole index without one.
- Opening a conversation in the web UI, or pressing its sync button, syncs that conversation.
- The optional safety net, a periodic index sync, as configured below.
- Discovery, as configured below.

**Development.** A PDS cannot resolve a did:web on a loopback URL, so notifications never arrive in local development. There, sync relies on the safety net, the sync button, and opening a chat.

**Inbound notifications.** `POST /xrpc/com.atproto.space.notifyWrite` and `POST /xrpc/com.atproto.space.notifySpaceDeleted` verify the service auth token with `verifyJwt` from `@atproto/xrpc-server`. The audience must be the service identifier, the `lxm` must match the method, and the issuer must be the space's authority, with its key resolved through `@atproto/identity`. Valid requests get 200 immediately, and the sync runs in the background. Invalid ones get 401.

**The sync ping.** `requestSync` authenticates with a service auth token from the caller's PDS, verified with `verifyJwt`. The audience must be the server's DID, the `lxm` must be `network.sharedcomputer.chat.requestSync`, and the issuer must be a spaces account on this server. A named conversation must belong to the issuer, or the call fails with `UnknownConversation`. A conversation the server has never synced is synced from the start, as a backfill.

**Discovery.** Discovery calls `com.atproto.space.listSpaces` filtered to the conversation type. It adds a `conversationRef` for any conversation that has none, with the title from its info record, and syncs it as a backfill. It runs at every login, and for active users on the configured interval. It repairs the index for clients that skipped the index convention, and for failed index writes.

**Activity.** `account.last_active_at`, from the auth spec, is updated on any web request, any turn, and any synced change. It decides which users the safety net and discovery cover.

### Sync configuration

The admin configures sync in `scn-chat.config.ts`:

```ts
sync: {
  safetyNet: { enabled: true, intervalMinutes: 15, activeWithinHours: 24 },
  discovery: { intervalMinutes: 60, activeWithinDays: 30 },
  allowUserOptOut: true,
}
```

- The safety net syncs the index of every user active within `activeWithinHours`, every `intervalMinutes`. That is one PDS call per user per interval, plus one per changed conversation.
- Discovery runs every `intervalMinutes` for users active within `activeWithinDays`.
- When `allowUserOptOut` is true, each user can turn off background sync for their account. The safety net and discovery then skip them, and only notifications, pings, and opening a chat sync their conversations. The setting is the `background_sync` column of `account`.

### API

| Route | Purpose |
|---|---|
| `GET /api/conversations?since=` | The chat index, or its changes since a revision |
| `POST /api/conversations` | Create a conversation |
| `GET /api/conversations/:skey?since=` | Info and messages, or their changes since a revision. Also syncs the conversation. |
| `GET /api/conversations/keys`, `GET /api/conversations/:skey/keys` | Every record's collection, key, and CID, without content, from a metadata-only listing. The browser store uses them to reconcile its copy. |
| `PATCH /api/conversations/:skey` | Change title (setting `titleSource: "user"`), tags, or system prompt |
| `DELETE /api/conversations/:skey` | Delete a conversation |
| `POST /api/conversations/:skey/sync` | Sync the conversation now |
| `GET /api/preferences`, `PUT /api/preferences` | Read and write preferences |
| `GET /api/account`, `PUT /api/account` | Read and change account settings, currently `backgroundSync` |
| `GET /api/events` | Server-sent events telling the browser which conversations changed, so it can fetch their changes |

All routes act on the signed-in user's own data. Message routes are in the chat-turns spec.

## Scope Boundaries

- No server-side copy or cache of chat content for spaces users.
- No migrating local users to spaces.
- No syncing repos other than the owner's.
- No notification registrations on individual conversations.
- No multi-instance deployment. Locks, credential caches, and the event bus are in-process.
- No encrypted conversations.

## Edge Cases and Decisions

- Reads pass through to the PDS on every request. The browser's own copy, not a server cache, is what makes the UI fast.
- The fallback backend emulates a PDS, including CIDs and an op log, so all code above `RecordStore` is the same for both kinds of user.
- Only the settings space is registered for notifications. Clients that skip the index convention are covered by the sync ping, by opening the chat, by the safety net, and by discovery.
- A conversation's first sync is a backfill. Chat-turns only answers recent messages from a backfill, so history is never replayed.
- The index write after a message write is not atomic with it. Discovery repairs a missing entry.
- Op log gaps are detected with the set hash, computed from metadata-only listings, so no record content is stored or even fetched.

## Acceptance Criteria

- [ ] Creating a conversation creates the space, its info record, and its `conversationRef`, for both backends.
- [ ] Writing a message updates the conversation's `conversationRef` with a new `updatedAt`.
- [ ] A title change is copied into the `conversationRef`.
- [ ] Tags are written only to the `conversationRef`, never to the info record.
- [ ] Syncing an info record whose title differs from the entry's copy rewrites the entry.
- [ ] Deleting a conversation deletes the space and its `conversationRef`.
- [ ] `createRecord` throws `RecordExists` for an existing key in both backends.
- [ ] An invalid record is rejected with `InvalidRecord` before any write.
- [ ] `updateInfo` with `unlessUserTitled` skips the write when the stored title source is `user`.
- [ ] The local backend's CIDs match what a PDS computes for the same record.
- [ ] Listing and reading return data from the record store with nothing stored server-side for spaces users.
- [ ] Listing and reading with `since` return only changes after that revision, including deletions.
- [ ] Login creates the settings space when missing and registers it for notifications.
- [ ] `did.json` publishes the `#scn_chat` service entry.
- [ ] A settings-space `notifyWrite` syncs every changed conversation.
- [ ] `notifyWrite` with a bad audience, method, or issuer returns 401.
- [ ] `requestSync` with valid service auth syncs the named conversation, and fails with `UnknownConversation` for someone else's.
- [ ] A conversation's first sync emits backfill events, and later syncs emit live events.
- [ ] An invalid synced message emits `message:invalid` and is not treated as a message.
- [ ] Discovery adds a missing `conversationRef` and syncs the conversation.
- [ ] The safety net and discovery follow the configured intervals, and skip users who turned background sync off.
- [ ] Users cannot turn off background sync when `allowUserOptOut` is false.
- [ ] Registrations are renewed when less than an hour remains.
- [ ] A first index sync only syncs conversations whose entries are inside the backfill window, and sets the cursor at the head.
- [ ] Syncs requested in quick succession for a user run once.
- [ ] Ops matching the server's own recent writes emit no events.
- [ ] A set hash mismatch resets the space's cursor and logs a warning.
- [ ] The keys routes return collections, keys, and CIDs without record content.
- [ ] The owner's writes to the settings space are forwarded to the server under its write policy, checked against a real PDS.

## Files

- (to be populated during implementation)
