# Encrypted Conversations

## Summary

A user can make a conversation encrypted. Its records are sealed in the browser before they leave the device, so the PDS and the SCN Chat server only ever hold ciphertext. Keys belong to the user's devices, and the owner's browser gives a conversation's key to anyone who needs to read it: the owner's other devices, the people it is shared with, and, if the user allows it, a turn runner in an attested enclave.

A model still has to read the conversation, so every turn is answered by a turn runner that holds the key. There are two: the browser itself, which calls the model directly, and an enclave runner, which is the server's turn logic running inside a hardware enclave whose code the browser verifies before trusting it with a key. Whoever runs the model can still see the prompt, unless the model also runs in an enclave. This is therefore not end-to-end encryption in the messaging sense. The app calls it encrypted conversations, and describes it as unreadable by the PDS and the app server.

The feature is built in four phases, each useful on its own:

1. Encrypted records, keys on the user's devices, sharing with people, and turns run in the browser with the user's own credentials.
2. Short-lived model tokens, so browser-run turns can use admin models, and verifying attested inference endpoints from the browser.
3. The enclave turn runner, which brings back background replies, tools, titles, and file ingestion for encrypted conversations.
4. Sealing more metadata, and sending tool traffic through Oblivious HTTP relays.

## Motivation

Spaces give access control, not confidentiality: the PDS operator can read everything in a space, and the SCN Chat server reads every conversation it answers. For chats with an AI assistant, which people use for health, legal, financial, and personal questions, that is a lot of trust in two operators the user may never have chosen deliberately.

The founding principle already keeps the server from storing chat content. Encryption goes further: the server should be unable to read content at all, and the PDS should be trusted to store and serve records but not to read them. The user's device is the one place plaintext lives, apart from whatever runs the model.

The lexicons were built for this. `encryptedContent` and the `sealed` fields on `info` and `conversationRef` exist, and the server already refuses to answer encrypted messages. What is missing is key management, the runners, and the rules for what the server may and may not do with sealed records.

## Design

### Trust model

| Party | Can read content | Relied on for |
|---|---|---|
| The web app code | Yes | Everything. It is served by the appview, and trusted because it is audited. |
| The SCN Chat server | No | Availability, relaying ciphertext, and authorizing model use. It sees usage metadata. |
| The enclave turn runner | Yes, inside the enclave, for conversations granted to it | Running only approved code, which the browser checks through attestation. |
| The PDS | No | Storing and serving records. It can withhold or roll back records, and sees write metadata. |
| The inference provider | Yes, unless it runs in an attested enclave | Answering. |
| Share recipients | Yes, for what is shared with them | Nothing. |

### Cryptography

- **Symmetric sealing.** AES-256-GCM with a random 96-bit nonce, through WebCrypto in the browser and `node:crypto` in the enclave runner. The scheme ID is `scn-aes256gcm-v1`.
- **Key wrapping.** HPKE (RFC 9180) in base mode with the X-Wing hybrid KEM (X25519 combined with ML-KEM-768), HKDF-SHA256, and AES-256-GCM, through `@hpke/core` and `@hpke/hybridkem-x-wing`. A wrapped key stays secret as long as either X25519 or ML-KEM holds. The scheme ID is `hpke-xwing-sha256-aes256gcm`.
- **Signatures.** Grants are signed by the owner with both Ed25519 and ML-DSA-65, through `@noble/curves` and `@noble/post-quantum`, and a signature is valid only when both verify. The signed message is the DAG-CBOR encoding of `{ uri, record }`, with the grant's own URI and the record without its signature fields. The scheme ID is `ed25519+mldsa65`.
- **Quantum resistance.** Records and grants sit on the PDS indefinitely, so everything that protects them must survive a future quantum computer. AES-256, SHA-256, and the 128-bit recovery code already do. Key wrapping and signatures are hybrid, so they do too, without depending on the newer post-quantum algorithms alone.
- **Padding.** Plaintext is padded to the Padmé length for its size, with a `0x80` byte followed by zeros, before sealing. Ciphertext sizes then reveal only a rough size class.
- **Associated data.** Every sealed value is bound to where it lives and to the record's clear fields. The associated data is the DAG-CBOR encoding of `{ uri, record }`, where `uri` is the record's full URI and `record` is the record with its sealed field removed (`content` for a message, `sealed` for the others). A PDS cannot move a ciphertext to another record, or change a clear field such as `generation.tools`, without decryption failing.
- **Fingerprints.** A fingerprint is the first 16 bytes of a SHA-256, in lowercase base32. A KEM key's fingerprint hashes its public key. An account's fingerprint hashes its KEM, Ed25519, and ML-DSA public keys together, and is the one users compare. Record keys and grants name keys by fingerprint.

### Keys

| Key | Kind | One per | Who can unwrap it | Where it is stored |
|---|---|---|---|---|
| Account key | An X-Wing key pair for receiving grants, plus Ed25519 and ML-DSA-65 key pairs for signing them | User | The user's devices | Public halves in an `encryptionKey` record in the user's public repo. Private halves in `keyBackup` records, one per recovery method, and on each device. |
| Settings key | AES-256, with epochs | User | The user's devices, and the delegation key | `keyGrant` records in the settings space |
| Conversation key | AES-256, with epochs | Conversation | The owner, each member, and the owner's delegation key if the conversation allows the enclave runner | `keyGrant` records in the conversation space |
| Delegation key | X-Wing key pair | User | The user's devices, and approved enclave runners | `keyGrant` records in the settings space, wrapped to the account key and to each approved runner key |

The delegation key exists so a new runner key costs one grant, not one grant per conversation. Conversation keys are wrapped to the delegation key, and the delegation key is wrapped to the runner.

A key's ID is its kind and epoch: `sk:0`, `ck:0`, `dk:0`. It is written to `encryptedContent.keyId` and to each grant.

Runner keys are X-Wing key pairs too.

A device never reads its own account's public keys from the PDS. It derives them from the private keys, so a PDS that swaps the published `encryptionKey` record cannot trick the owner into granting to someone else.

### Lexicon additions

All three are new record types, so they are compatible with published lexicons. `keyGrant` joins both space declarations, `keyBackup` joins the settings space, and all three join the permission set: the space permissions for the first two, and a `repo` permission for `encryptionKey`.

**`network.sharedcomputer.chat.encryptionKey`**, key `literal:self`, in the public repo:

```ts
{
  kemKey: bytes              // X-Wing public key, 1,216 bytes
  ed25519Key: bytes          // 32 bytes
  mldsaKey: bytes            // ML-DSA-65 public key, 1,952 bytes
  fingerprint: string
  createdAt: datetime
}
```

**`network.sharedcomputer.chat.keyGrant`**, key `{keyId}.{recipient fingerprint}`, in conversation and settings spaces:

```ts
{
  keyId: string              // 'ck:2'
  recipient: string          // fingerprint of the key it is wrapped to
  recipientKind: 'account' | 'delegate' | 'runner'
  recipientDid?: did         // for account recipients
  sender: string             // fingerprint of the owner's account key
  scheme: string
  enc: bytes                 // HPKE encapsulated key, 1,120 bytes for X-Wing
  ciphertext: bytes          // the wrapped key
  signatureScheme: string
  ed25519Sig: bytes          // 64 bytes
  mldsaSig: bytes            // 3,309 bytes
  createdAt: datetime
}
```

**`network.sharedcomputer.chat.keyBackup`**, key `recovery`, `passkey-{credential hash}`, or `link-{tid}`, in the settings space:

```ts
{
  method: 'recovery-code' | 'passkey' | 'device-link'
  credentialId?: bytes       // passkey only
  salt: bytes
  nonce: bytes
  ciphertext: bytes          // the sealed account private keys
  expiresAt?: datetime       // device-link only
  createdAt: datetime
}
```

### What gets sealed

| Record | Sealed | In the clear |
|---|---|---|
| `message` | `content`, as `encryptedContent`, whose plaintext is the `plainContent` | `role`, `parent`, `generation`, `model`, `effort`, `status`, `error`, `usage`, `createdAt` |
| `info` | `title`, `systemPrompt`, in `sealed` | `titleSource`, `createdAt` |
| `conversationRef` | `title`, `tags`, in `sealed`, under the settings key | `conversation`, `updatedAt` |
| `preferences` | `customInstructions`, in a new optional `sealed` field, under the settings key | the rest |
| Blobs | The bytes | Size |

A conversation is encrypted when its `info` record has `sealed`. It is chosen when the conversation is created, defaulting to a new `encryptByDefault` preference, and never changes. An existing plaintext conversation cannot be converted, since the PDS may keep earlier versions of its records.

**Blobs** are sealed in the browser as the nonce followed by the AES-GCM ciphertext, with the conversation URI and `blob` as associated data, and uploaded as `application/octet-stream`. The sealed parts refer to them with a blob ref carrying the ciphertext's CID and the plaintext's MIME type. The outer `encryptedContent.blobs` lists the same blobs with their real, octet-stream refs, so the PDS keeps them.

Once a device holds a key, it reads records exactly as before. Sealing happens at one boundary in the browser, `apps/web/src/crypto/`, and everything above it works with plaintext records.

### Account setup and recovery

Turning encryption on for the first time:

1. The browser generates the account key and a recovery code of 128 random bits, shown once as 26 base32 characters in groups of four.
2. It offers to register a passkey with the WebAuthn PRF extension, and seals the account private key under a key from HKDF over the PRF output, as a `passkey` backup. A passkey synced by the platform then unlocks new devices without the code.
3. It seals the account private key under HKDF over the recovery code, as the `recovery` backup.
4. It publishes the `encryptionKey` record, creates the settings key, and grants it to the account key.
5. It keeps the account private key in IndexedDB. The device is trusted, as the browser store already is.

On a new device, after sign-in, a user with an `encryptionKey` record and no local key sees an unlock screen offering:
- the passkey,
- the recovery code, or
- a link from another device: that device writes a `link-{tid}` backup under a random secret it shows as a QR code and short code, which expires after ten minutes and is deleted once used.

If every device and recovery method is lost, encrypted conversations cannot be read. The user can reset, which creates a new account key and leaves the old conversations unreadable but deletable. The setup screen says this plainly before creating the key.

### Conversation keys and epochs

- Creating an encrypted conversation creates `ck:0` and grants it to the owner's account key.
- Sharing with a person grants every epoch to their account key, read from their `encryptionKey` record, so they can read the history.
- Removing a person, or turning off the enclave runner for the conversation, creates the next epoch and grants it only to the remaining recipients. New records use the newest epoch. Old records are not re-sealed.
- A recipient only accepts a grant whose sender is the owner's account key and whose signatures both verify. A grant the PDS wrote on its own fails that check and is ignored, with a warning.

The owner's browser pins each member's account key fingerprint the first time it grants to them, and warns before granting to a changed key. Two users can compare fingerprints out of band from the share dialog.

### What the server does with encrypted conversations

The server holds no keys, and treats sealed records as opaque:

- **Writes.** For an encrypted conversation, write routes accept a record the browser has already sealed. The server validates the outer record against the lexicon, as it does now, and never looks inside. Routes that build records from plaintext refuse encrypted conversations with 400.
- **Turns.** Chat-turns never claims a turn in an encrypted conversation unless it is the enclave runner and holds a grant for it. It skips the turn without writing anything, so a browser runner can claim it.
- **Sync.** The title copy from `info` to `conversationRef` is skipped for sealed records. Discovery adds a missing `conversationRef` for an encrypted conversation without a title, and the owner's browser fills in `sealed` the next time it syncs.
- **Attachments.** `POST /api/attachments` takes sealed blobs as `application/octet-stream`, checks only the size, and runs no ingester.
- **Streaming.** The server relays encrypted stream events without reading them.
- **Credentials.** A user can store a credential sealed under their settings key. The server stores it in `provider_credential` like any other, but cannot decrypt it, so only runners can use it. API keys stay in the app database, not in records.

### Turn runners

A turn runner answers turns for a conversation it can decrypt. Runners claim turns exactly as today: by creating the pending reply at `{userMessageKey}.r{attempt}`, so only one runner answers each attempt, whichever it is.

The turn logic moves out of `apps/server/src/turns/` into `packages/turn-engine`, which runs in both Node and the browser. It takes decrypted records, a model, and tools, and produces reply parts and stream events: prompt building, reasoning replay, the stream-part mapping, and hooks. The plaintext server, the browser runner, and the enclave runner all use it, so a conversation behaves the same whichever runner answers.

**Browser runner (phase 1).** When a user sends a message in an encrypted conversation that does not allow the enclave runner, the browser:

1. Seals and writes the user message with its `generation` request.
2. Claims the turn by writing a sealed, empty pending reply.
3. Builds the prompt from its local, decrypted copy.
4. Calls the model directly from the browser and shows the stream.
5. Seals and writes the final reply.
6. After the first complete reply, generates a title the same way the titles plugin does, if the user's preferences allow, and writes it sealed to `info` and `conversationRef`.

Provider plugins that can run in a browser export a `browser` entry with the same `createModel`. The four shipped providers do. Anthropic needs its direct browser access header, and a self-hosted endpoint must allow CORS from the app's origin. The private network guard does not apply, since the requests come from the user's own browser.

The browser runner uses the user's sealed credentials, and admin models through the short-lived tokens of phase 2. It offers no tools, because the shipped tools run on the server, and calling them would give the server the tool input. PDFs are read in the browser with `unpdf` at upload, and the extracted text is sealed as its own blob. Other ingesters are unavailable until phase 3.

A browser that closes mid-turn leaves a pending reply. When the owner's browser opens a conversation, it rewrites as `error`, with the message "interrupted", any pending reply that is older than `turns.timeoutSeconds` plus a minute and is not being run by this browser.

**Enclave runner (phase 3).** See below.

### Short-lived model tokens (phase 2)

A provider plugin may implement:

```ts
issueToken?(args: { modelId: string; user: Did; ttlSeconds: number }): Promise<{ token: string; baseURL: string; expiresAt: string }>
```

`POST /api/models/token` with a model reference checks the user's roles, as model resolution does, and returns a token for an admin model whose provider can issue one. The browser runner uses the token and base URL in place of an API key. Tokens last `turns.tokenTtlSeconds`, default 300, and name one model.

The OpenAI-compatible plugin issues tokens for a self-hosted gateway when configured with `tokenSigningKey`: an ES256-signed JWT with `sub` (the user's DID), `model`, `exp`, and an optional `maxTokens`. `apps/token-gateway` is a small reference gateway that sits in front of vLLM or llama.cpp, checks the token and model, forwards the request, and reports usage back to the server. The server never sees the prompt.

### Attested inference from the browser (phase 2)

A provider plugin may export `attestation`, a browser module that verifies the provider's attestation and returns the key to encrypt requests to. A model whose provider has attestation is marked in `GET /api/models`, and an encrypted conversation can require attested models, which the model picker then enforces. This is an interface. Which providers implement it depends on who offers attested inference.

### Enclave turn runner (phase 3)

`apps/runner` is a separate process that runs the turn engine inside a confidential VM. It holds no OAuth sessions and talks to the PDS only through the server, so everything it sends out of the enclave is sealed.

**Its key.** On start, the runner gets its runner key and a platform attestation whose report data contains the key's fingerprint. `GET /api/runner` on the server returns the runner's public key, attestation, and build measurement.

**Approving it.** The web app ships with an allowlist of approved runner measurements, each matching a reproducible build published to a transparency log. The browser verifies the attestation's signature chain to the hardware vendor's root, checks that the measurement is on the allowlist, and checks that the report data names the key. If everything checks out, it grants the delegation key to the runner key. A new runner key means one new grant, which the browser makes the next time it opens the app.

**Allowing it per conversation.** A conversation allows the enclave runner when its owner turns on background replies for it, defaulting to a `backgroundRepliesByDefault` preference. That grants the conversation key to the delegation key. Turning it off rotates the conversation key.

**Running a turn.** The server hands the runner a conversation URI, the user message key, and, if the user's credential is a server credential, its key. The runner:

1. Reads the grants and records through the server.
2. Unwraps the delegation key, then the conversation and settings keys.
3. Decrypts, claims the turn with a sealed pending reply, and runs the turn engine with plugins loaded inside the enclave: providers, tools, hooks, ingesters, and titles.
4. Seals each stream event under the conversation key, with the reply URI and event number as associated data, for the server to relay.
5. Writes the sealed final reply.

The runner holds unwrapped keys in memory only for the length of a turn. Admin API keys are released to the runner by the operator's key management, never to the server. Sealed user credentials are opened with the settings key.

The browser posts turns to the server instead of running them itself when the conversation allows the enclave runner and `GET /api/runner` returns an approved runner. Direct PDS writes get background replies in those conversations too, since sync finds the turn and the runner holds a grant.

### Metadata hardening (phase 4)

- **Sealed message fields.** A new `defs#sealedMessage` type holds `parts` plus `parent`, `generation`, `model`, `effort`, `usage`, and `error`. It becomes the plaintext of a message's `encryptedContent`, and those fields are left out of the clear record. Readers accept both it and `plainContent`. `role`, `status`, and `createdAt` stay in the clear, since the lexicon requires the first and last and runners need the status to find stale claims.
- **Oblivious HTTP for tools.** Tool plugins in the enclave runner send outbound requests through a configured OHTTP relay when the tool's service offers a gateway, so the service sees the query but not which instance or user sent it.

### Web UI

Barebones, like the rest of the UI:

- An encryption section in settings: set up, show the account fingerprint, manage passkeys, view the recovery code once, link a device, and reset.
- An unlock screen on a new device.
- An "Encrypted" checkbox in the new conversation form, and a lock marker on encrypted conversations in the list.
- In the share dialog: each member's fingerprint, and a warning when a member has no `encryptionKey` or it has changed.
- A "Background replies" switch on encrypted conversations, shown only when an approved runner is available.

### Conventions for other clients

`lexicons/README.md` gains a section on encrypted conversations: the schemes, associated data, padding, key IDs and grants, blob sealing, and that the server answers encrypted turns only through a granted enclave runner. A direct client must be its own runner or grant the delegation key.

## Scope Boundaries

- No converting existing conversations to or from encrypted.
- No public sharing of encrypted conversations. Sharing with people only. A link carrying the key in its fragment could come later.
- No detection of records the PDS withholds, rolls back, or deletes.
- No encryption of the browser's local database beyond what the browser provides.
- No hiding of timing, record counts, sharing membership, or approximate sizes from the PDS.
- No tools in browser-run turns.
- No protection against a compromised device or a malicious web app build. The audited web app is the root of trust.
- No encryption of which model or provider a conversation uses until phase 4.

## Edge Cases and Decisions

- Keys live in the user's settings space and public repo, never in the app database, so the PDS stays the source of truth for everything including keys, and the server has nothing to leak.
- Conversation keys are granted to a per-user delegation key instead of directly to runner keys, so a new runner costs one grant, not one per conversation.
- Grants are signed by the owner's account key, so a PDS cannot plant a key it knows as a new epoch. They use a separate hybrid signature instead of HPKE's auth mode, because auth mode only works with Diffie-Hellman KEMs and not with ML-KEM.
- Key wrapping and signatures are hybrid rather than post-quantum alone, so a flaw found in ML-KEM or ML-DSA leaves the design no weaker than classical X25519 and Ed25519.
- Post-quantum keys and signatures make each grant about 4.5 KB and each `encryptionKey` record about 3 KB. Sharing a long-lived conversation with someone writes one grant per epoch, which is still small.
- ML-KEM and ML-DSA are not in WebCrypto in every browser, so the account private keys are held as raw bytes in IndexedDB rather than as non-extractable WebCrypto keys.
- The associated data covers the clear fields, so a PDS cannot change `generation`, `role`, or `parent` on a sealed record.
- The owner's browser derives its own public key from the private key instead of reading `encryptionKey`, so a swapped record cannot redirect the owner's grants.
- Removing a member rotates the key but does not re-seal history. The member could already read it and may have kept a copy.
- The recovery code has 128 bits of entropy, so the backup sealed under it resists offline guessing by the PDS without a slow KDF.
- Local fallback users can encrypt too. Sealing happens in the browser above the record store, so the local database holds only ciphertext. They have no sharing, so they skip publishing `encryptionKey`.
- The browser store holds decrypted content, and search indexes it. The device is trusted.
- Sealed credentials are stored in the app database, keeping the rule that API keys never go in records, while the server still cannot read them.
- The main server still sees server credentials passed to the enclave runner. That exposes the API key, not chat content, and users who mind can use sealed credentials.
- Stream events from the enclave runner are sealed under the conversation key, so where TLS terminates does not matter. Browsers cannot check that TLS ends inside an enclave, and this makes it irrelevant.
- **To verify during implementation:** that the alpha PDS accepts an octet-stream blob referenced from `encryptedContent.blobs` without checking the sealed refs.
- **To verify during implementation:** the WebAuthn PRF extension in the browsers we support, with the recovery code as the fallback everywhere.
- **To verify during implementation:** the maturity and audit status of `@hpke/hybridkem-x-wing` and `@noble/post-quantum`, and which HPKE draft codepoints for X-Wing they follow. Switch to WebCrypto where browsers ship ML-KEM and ML-DSA.
- **To verify during implementation:** whether a spaces PDS keeps earlier versions of a record after `putRecord`, which decides whether converting a conversation could ever be safe.

### Changes to other specs

When this is built, these specs need updating: chat-storage (sealed writes, sync and discovery), chat-turns (runners and skipping encrypted turns), sharing (grants, and refusing public mode), attachments (sealed uploads), titles (runner-generated titles), providers (sealed credentials, tokens, browser entries, attestation), search and browser-store (decrypting on sync), and auth (the permission set additions).

## Recommended deployment outside this codebase

The design gives the strongest guarantees when the appview operator and the inference provider are set up as follows. Neither is under this project's control.

- **The appview operator** serves the web app from a reproducible build whose hash is published and independently audited for each release, ideally also as a signed browser extension. It runs `apps/runner` in a confidential VM (AMD SEV-SNP or Intel TDX), publishes each runner build's measurement to a transparency log, and uses key management that releases the runner key and admin API keys only to enclaves with an approved measurement.
- **The inference provider** runs models on confidential-computing GPUs inside a CPU enclave, publishes attestations that cover the serving stack and model weights, keeps no logs outside the enclave, and offers an OHTTP gateway so requests cannot be tied to a client. Its TLS endpoints negotiate hybrid post-quantum key exchange, such as X25519MLKEM768, since prompts reach it in plaintext inside TLS and could otherwise be recorded now and decrypted later.

Even then, the trust ends with the hardware vendors and the physical security of the datacenters.

## Acceptance Criteria

Phase 1:

- [ ] Setup publishes an `encryptionKey`, writes a `recovery` backup, grants the settings key to the account key, and stores the account key on the device.
- [ ] A new device unlocks with the recovery code, with a passkey backup, and with a device link.
- [ ] A device link backup expires after ten minutes and is deleted once used.
- [ ] A wrong recovery code fails without revealing anything else.
- [ ] Creating an encrypted conversation writes a sealed `info` and `conversationRef`, and grants `ck:0` to the owner.
- [ ] Every message, info, `conversationRef`, and sealed preference written for an encrypted conversation contains no plaintext content.
- [ ] Sealed values round-trip through seal and open with padding removed.
- [ ] A sealed value moved to another record key fails to open.
- [ ] A sealed message whose clear `generation` was changed fails to open.
- [ ] A grant not sent by the owner's account key is ignored with a warning.
- [ ] A grant with a valid Ed25519 signature but an invalid ML-DSA signature is ignored, and so is the reverse.
- [ ] A signed grant copied to another record key fails verification.
- [ ] A key wrapped with X-Wing opens only with the matching private key.
- [ ] The owner's browser never uses the published `encryptionKey` for its own grants.
- [ ] Sharing with a person grants every epoch to their account key, and they can read the history.
- [ ] Removing a person creates a new epoch that they are not granted, and new records use it.
- [ ] Granting to a member whose key fingerprint changed shows a warning first.
- [ ] Making an encrypted conversation public is refused.
- [ ] Sealed blobs upload as octet-stream, and images and PDFs in encrypted conversations open in the browser.
- [ ] The server never claims a turn in an encrypted conversation without a grant, and writes nothing for it.
- [ ] The browser runner claims, streams, and writes a sealed reply using a sealed credential.
- [ ] When the web UI and another runner both try to claim the same turn, exactly one generation runs.
- [ ] The browser runner writes a sealed generated title after the first complete reply, unless the preferences turn titles off.
- [ ] The owner's browser marks stale pending replies it is not running as interrupted.
- [ ] Sync skips the title copy for sealed info records, and discovery adds an untitled entry for an encrypted conversation.
- [ ] A sealed credential is stored by the server and never decrypted by it.
- [ ] Decrypted messages appear in local search.
- [ ] A local fallback user can create and use encrypted conversations, and the local database holds only ciphertext for them.
- [ ] The plaintext server, the browser runner, and the enclave runner produce the same prompt from the same conversation, through the turn engine.

Phase 2:

- [ ] `POST /api/models/token` returns a token only for admin models the user's roles allow.
- [ ] The reference gateway accepts a valid token for its model and refuses an expired token, a wrong model, and a bad signature.
- [ ] A browser-run turn with an admin model sends no prompt content to the server.
- [ ] A conversation that requires attested models refuses models without attestation.

Phase 3:

- [ ] The browser grants the delegation key only to a runner whose attestation verifies, whose measurement is on the allowlist, and whose report data names its key.
- [ ] A runner with an unknown measurement gets no grant.
- [ ] Turning background replies on grants the conversation key to the delegation key, and turning it off rotates the key.
- [ ] The enclave runner answers a direct PDS write in a conversation that allows it.
- [ ] Stream events from the runner are sealed, and the browser opens them.
- [ ] Everything the runner sends to the server is sealed.
- [ ] Tools, titles, and ingesters run in enclave-run turns.

Phase 4:

- [ ] A message sealed as `sealedMessage` has no `parent`, `generation`, `model`, `effort`, `usage`, or `error` in the clear, and readers accept both plaintext shapes.
- [ ] A tool with an OHTTP gateway sends its requests through the configured relay.

## Files

Planned:

- `lexicons/network/sharedcomputer/chat/encryptionKey.json`, `keyGrant.json`, `keyBackup.json`, and changes to `defs.json`, `preferences.json`, `conversation.json`, `settings.json`, and `permissions.json`
- `lexicons/README.md`
- `packages/turn-engine/`
- `apps/web/src/crypto/`
- `apps/web/src/runner/`
- `apps/server/src/turns/`, `apps/server/src/storage/`, `apps/server/src/sync/`, `apps/server/src/blobs/`, `apps/server/src/providers/`
- `apps/runner/`
- `apps/token-gateway/`
- `plugins/*/src/browser.ts`
