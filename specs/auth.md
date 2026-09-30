# Auth

## Summary

Users sign in with their atproto account through atproto OAuth, using `@atproto/oauth-client-node`. The server is a confidential OAuth client, so it holds long-lived sessions and can write replies to the user's PDS in the background. After login, the server checks which permissions the PDS actually granted. If the space permissions are there, the account uses spaces storage. If not, because the PDS does not support spaces, the account falls back to local storage. The browser holds only an opaque session cookie, and all PDS calls happen on the server.

## Motivation

An atproto account is the only identity SCN Chat uses, for spaces and fallback users alike. OAuth is the standard way for an app to act for a user. The server needs sessions that survive for months, because a reply can be triggered by a record written from another client while the user is away. atproto only grants long sessions (up to two years, refreshed every three months) to confidential clients. Public clients are capped at two weeks.

## Design

### OAuth client

`apps/server/src/auth/client.ts` creates one `NodeOAuthClient`:

- **Production.** A confidential client with `token_endpoint_auth_method: "private_key_jwt"`, `dpop_bound_access_tokens: true`, and a keyset of ES256 keys from `@atproto/jwk-jose`. The client ID is `${PUBLIC_URL}/oauth-client-metadata.json`. The server publishes the metadata at that path and the public keys at `/oauth/jwks.json`. `PUBLIC_URL` must be HTTPS.
- **Development.** When `PUBLIC_URL` is a loopback address, the server uses `buildAtprotoLoopbackClientMetadata` instead. Loopback clients are always public, so development sessions last two weeks at most.

The OAuth state and session stores are `oauth_state` and `oauth_session` tables, each with a key, a JSON value, and an updated timestamp. Sessions are keyed by DID.

### Scope

The requested scope is `atproto include:network.sharedcomputer.chat.permissions blob:*/*`, with the permission set NSID taken from the lexicon module, never typed as a literal. The permission set grants the conversation, shared-read, and settings permissions. Blob access is requested as its own `blob:*/*` scope, because PDSs only take `space`, `repo`, and `rpc` permissions from a permission set and drop the rest. The PDS resolves it through the lexicon's DNS record, so the lexicons must be published under `sharedcomputer.network` before anyone can log in. A fork publishes its own lexicons under its own domain.

Before the lexicons are published, setting `auth.scopeMode` to `raw` lets a PDS without spaces sign users in, for testing the local fallback. It requests the equivalent raw scopes instead, built from the same lexicon module: `space:` scopes for the conversation, shared-read, and settings permissions with every collection listed, plus `blob:*/*`. The default is `permission-set`, and production startup refuses `raw`.

### Login

1. The web UI sends the user to `GET /oauth/login?identifier=<handle, DID, or PDS URL>`.
2. The server calls `client.authorize(identifier, { scope })` and redirects to the returned URL.
3. `GET /oauth/callback` calls `client.callback(params)` and gets an `OAuthSession`.
4. The server reads the granted scope with `session.getTokenInfo()`. Using `ScopePermissions` from `@atproto/oauth-scopes`, it checks whether the scope allows creating conversation spaces for the user's own DID.
5. It upserts the `account` row and creates a web session (below), then redirects to `/`.

A PDS without spaces drops space scopes silently instead of refusing them, so login always succeeds. The check in step 4 is how the server tells the two kinds of PDS apart.

### Storage mode

The `account` table holds the DID, current handle, PDS URL, storage mode (`space` or `local`), the `background_sync` setting from the chat-storage spec (default true), and creation, last-login, and last-activity times.

- A new account whose granted scope allows spaces gets `space`. Otherwise it gets `local`.
- An existing `local` account stays `local` even if its PDS gains spaces support. Moving data to the PDS is a future migration feature.
- An existing `space` account whose granted scope no longer allows spaces fails login with a message explaining that its chats live in spaces the PDS no longer supports. It does not switch to local silently, which would hide the user's existing chats.

### Web sessions

The browser gets an `scn_session` cookie holding 32 random bytes, base64url encoded. It is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` whenever `PUBLIC_URL` is HTTPS. The `web_session` table stores the token's SHA-256 hash, the DID, and creation and expiry times. Sessions last `auth.sessionTtlDays` days, default 30, and are extended when used in the last half of their life.

Hono middleware resolves the cookie to the account on every `/api` request. Routes that need a user return 401 without one.

Every non-GET `/api` request must carry an `Origin` header matching `PUBLIC_URL`, or it is refused with 403. Together with `SameSite=Lax`, that blocks cross-site request forgery.

### Acting for a user

Other specs get a PDS client for a user through one function:

```ts
getPdsClient(did): Promise<Client>
```

It calls `client.restore(did)` and wraps the session in `@atproto/lex-client`'s `Client`. Token refresh happens inside the OAuth library. If the session is gone or refresh fails, it throws `SessionExpired`. The web UI answers that by sending the user to log in again, and a background turn records it as the reply's error.

### Roles

Roles decide what a user may do beyond using their own API keys. In phase 1 they only gate admin models, as the providers spec describes.

Roles are defined in `config.yml`:

```yaml
roles:
  staff: ['did:plc:abc...', 'did:plc:def...']
  beta: ['did:plc:ghi...']
```

- Every signed-in user has the implicit `user` role. The name `user` cannot be defined in the config.
- Role names match `^[a-z][a-z0-9-]*$`, and every entry must be a valid DID. Startup fails otherwise, naming the role or entry.
- `rolesFor(did)` returns `user` plus every configured role listing the DID. Roles are read from the config on each call, so they apply without a new login once the server restarts with a changed config.

### Logout

`POST /api/logout` deletes the web session and clears the cookie. It does not revoke the OAuth session, since background replies still need it. `POST /api/logout?everywhere=1` also calls `client.revoke(did)` and deletes all of that user's web sessions.

### Endpoints

| Route | Purpose |
|---|---|
| `GET /oauth-client-metadata.json` | OAuth client metadata |
| `GET /oauth/jwks.json` | Public signing keys |
| `GET /oauth/login` | Start login |
| `GET /oauth/callback` | Finish login |
| `GET /api/me` | The signed-in user's DID, handle, storage mode, and roles |
| `POST /api/logout` | Sign out |

### Configuration

Public settings, in `config.yml`:

| Setting | Override | Purpose |
|---|---|---|
| `auth.scopeMode` | `OAUTH_SCOPE_MODE` | `permission-set` (default) or `raw`, for local development only. |
| `auth.sessionTtlDays` | `SESSION_TTL_DAYS` | Web session lifetime. Default 30. |
| `auth.plcUrl` | `PLC_URL` | The PLC directory. Default `https://plc.directory`. |

Secrets, in `.env`:

| Variable | Purpose |
|---|---|
| `OAUTH_PRIVATE_KEYS` | JSON array of ES256 private JWKs, each with a `kid`. Required in production. |

A `pnpm keys` script prints a fresh `OAUTH_PRIVATE_KEYS` value and a `SECRET_KEY` for the providers spec.

## Scope Boundaries

- No accounts outside atproto, and no passwords.
- No admin role or admin screens in phase 1. Admin configuration lives in the config file.
- No roles stored in the database, and no UI for assigning them.
- No migration of `local` accounts to spaces.
- No revoking the OAuth session on ordinary logout.

## Edge Cases and Decisions

- The permission set still lists a `blob` permission, which PDSs ignore. It stays because published lexicons are never tightened, and the separate `blob:*/*` scope is what grants uploads.
- Login depends on the published permission set. An unpublished or unresolvable permission set makes every login fail with `invalid_scope`, and the login page shows that error.
- A handle that doesn't resolve to an account shows "We couldn't find an account for that handle. Check the spelling, or sign in with your DID instead." Some PDSs serve handles that can't be resolved, such as a wildcard domain whose certificate doesn't cover it, and the DID works for those. A DID that doesn't resolve says the DID wasn't found. The sign-in form itself only asks for a handle.
- A spaces account that loses spaces support fails login loudly instead of falling back to local storage.
- Loopback development uses a public client, because atproto OAuth does not allow confidential loopback clients.
- **To verify during implementation:** that a PDS without spaces accepts the permission set and skips its space permissions, as the research into the alpha source suggests.
- Verified against the alpha PDS: its consent screen resolves the lexicon of every space type in the scope, for raw `space:` scopes as well as the permission set, and refuses the request with `invalid_scope` ("Unable to retrieve space declarations") when it cannot. A spaces PDS therefore needs the lexicons published in either scope mode.
- Spaces support is checked after resolving `self` authorities in the granted scope to the user's DID, since `ScopePermissions` does not resolve them itself.
- Login calls an `onLogin` hook, which creates the settings space and, for spaces users, registers for notifications, runs discovery, and syncs the index in the background. A failure is logged and does not block the login.
- A handle is stored only when it resolves back to the same DID.
- `JoseKey` comes from `@atproto/oauth-client-node`'s re-export, so key types cannot come from two package versions.
- In development `PUBLIC_URL` is the Vite dev server, which proxies the server routes, so the OAuth callback returns to the web app.

## Acceptance Criteria

- [ ] Client metadata is served at the client ID URL, with `private_key_jwt` and the public keys at `/oauth/jwks.json`.
- [ ] A loopback `PUBLIC_URL` uses loopback client metadata.
- [ ] Production startup fails without valid `OAUTH_PRIVATE_KEYS` or with a non-HTTPS `PUBLIC_URL`.
- [ ] The requested scope includes the permission set, with its NSID taken from the lexicon module.
- [ ] An `invalid_scope` error from the PDS is shown on the login page.
- [ ] A handle that doesn't resolve shows an error suggesting the DID, and a DID that doesn't resolve says it wasn't found.
- [ ] `auth.scopeMode: raw` requests raw space and blob scopes equivalent to the permission set, and production startup refuses it.
- [ ] A new account whose granted scope allows spaces gets storage mode `space`.
- [ ] A new account whose granted scope lacks spaces gets storage mode `local`.
- [ ] A `space` account whose granted scope lacks spaces fails login with an explanation.
- [ ] A `local` account stays `local` when its scope later allows spaces.
- [ ] The session cookie is HttpOnly and SameSite=Lax, and only its hash is stored.
- [ ] `/api` routes return 401 without a valid session and 403 for a non-GET request with a foreign `Origin`.
- [ ] Sessions expire after the TTL and are extended when used in the second half of it.
- [ ] `getPdsClient` throws `SessionExpired` when the OAuth session cannot be restored.
- [ ] Logout clears the web session and keeps the OAuth session, and logout everywhere revokes it.
- [ ] `rolesFor` returns `user` plus every configured role that lists the DID.
- [ ] A config defining a role named `user`, an invalid role name, or an invalid DID fails startup, naming it.
- [ ] `GET /api/me` includes the user's roles.
