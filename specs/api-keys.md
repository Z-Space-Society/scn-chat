# API Keys

## Summary

Admins issue API keys in the admin area. Each key has a label and a set of roles, and is sent as `Authorization: Bearer <key>`. A route opens itself to API keys by naming the roles it allows, and only those routes accept keys. The first such route is cron, from [[cron]].

## Motivation

Some server work has to be started from outside the browser, such as a crontab calling the server on a schedule. Those callers have no atproto account and no web session, so they need a credential an admin can issue and revoke without touching the server's environment or restarting it.

## Design

### Keys

```
api_key (id text primary key, label text, key_hash text unique, roles_json text, created_by text, created_at text, last_used_at text null)
```

- **Format.** A key is `scn_` followed by 32 random bytes in base64url. It is shown once, when it is issued, and only its SHA-256 hash is stored. A key is random, so a fast hash is enough, and a key is found by looking up its hash.
- **Roles.** A key holds one or more existing roles, including the built-in `user` and `admin`. A key has no DID, so it holds only the roles it's given, and PDS host and handle domain matches don't apply to it.
- **Changing a key.** Keys can't be edited. To change a key's roles, issue a new one and revoke the old.
- **Deleting a role** that a key holds is refused, with the keys listed, like the other uses of a role in [[admin]].
- **Last used.** A successful request with a key records the time, so an admin can spot keys nobody uses.

### Route access

`requireApiKey(...roles)` is Hono middleware that opens a route to API keys:

- No `Authorization: Bearer` header, or a key that doesn't match, is a 401.
- A key that holds none of the route's roles is a 403.
- A route without `requireApiKey` never accepts a key, and a route with it never accepts a web session.

Keys never appear in logs. A rejected request logs the route and the reason, and an accepted one logs the key's label.

### Admin API

| Route | Purpose |
|---|---|
| `GET /api/admin/api-keys` | Every key's ID, label, roles, creator, created time, and last use. Never the key or its hash. |
| `POST /api/admin/api-keys` | Issue a key from `{ label, roles }`. Answers with `{ id, key }`, the only time the key is returned. |
| `DELETE /api/admin/api-keys/:id` | Revoke a key. |

### Admin area

**API keys** (`/admin/api-keys`): a table of keys with their label, roles, created time, last use, and a Revoke button, and a form with a label and a checkbox per role that issues a key and shows it once, with a note that it can't be shown again.

### Documentation

- `CLAUDE.md` and `docs/architecture.md`: the rule against a public HTTP API allows routes opened to API keys, currently cron.
- `docs/deployment.md`: issuing a key for cron.

## Scope Boundaries

- No keys acting as a user. A key has no DID and can't read or write chats.
- No keys on existing routes. Only routes that name roles with `requireApiKey` accept them.
- No expiry. A key lasts until it is revoked.
- No keys in `.env` or files. Keys are issued and revoked in the admin area.

## Edge Cases and Decisions

- Keys are compared by hash lookup, so there is no timing difference to measure between keys.

## Acceptance Criteria

- [ ] Issuing a key returns it once, and only its hash is stored.
- [ ] A route opened to a role accepts a key holding that role.
- [ ] A missing or unknown key is a 401, and a key without the route's roles is a 403.
- [ ] A revoked key is a 401.
- [ ] A route not opened to keys doesn't accept one, and a key route doesn't accept a web session.
- [ ] Issuing a key with a role that doesn't exist is refused.
- [ ] Deleting a role a key holds is refused, listing the keys.
- [ ] The key list never contains a key or its hash.
- [ ] A successful request records the key's last use.

## Files

- `apps/server/src/auth/api-keys.ts`
- `apps/server/src/admin/routes.ts`
- `apps/server/src/db/migrations/`
- `apps/web/src/pages/AdminPage.tsx`
- `CLAUDE.md`, `docs/architecture.md`, `docs/deployment.md`
