# SCN Member Registry

## Summary

The `@scn-chat/plugin-scn-member-registry` plugin gives every active member of the Shared Computer Network a role in SCN Chat. It reads the member list from the SCN member registry, a set of Lua scripts and lexicons running on a HappyView instance, by calling its `listMembers` query with a service token. When an SCN member signs in, it adds them to a role before the access check, and on every [[cron]] run it brings the role in line with the registry for everyone who has an account. The role is meant to be an invite role, so that only SCN members can create an account, and to limit admin models and other admin-paid features to members.

To support it, core replaces plugin role sources with `ctx.roles.syncMembers` and `ctx.roles.addMember`, which change a role's stored members, and a `signIn:before` hook.

## Motivation

SCN members apply with a public record on their own PDS and are approved or revoked by SCN admins in Corliss, which writes grants and revocations into the registry's permissioned space on HappyView. SCN Chat should honor those decisions without an admin copying each one by hand.

The plugin is the source of truth for its role. The role holds the members who have an account, and each sync removes anyone the registry doesn't list, including people an admin added by hand. A revocation removes the role and nothing else: the account stays, along with any other role an admin gave, so a revoked member keeps what's open to everyone, such as their own API keys, and loses what's limited to the role. Suspending is left to admins.

Storing the role, rather than asking the plugin on every check, means HappyView being slow or down never slows a request and a restart keeps the role as it was. Only members who sign in are stored, so the server doesn't hold a copy of the whole registry. Sign-in fetches a fresh copy first, so someone approved a minute ago can sign up right away.

## Design

### Changes to core

`RoleSource`, `RoleContext`, and `ctx.roleSources` are removed from the plugin API. `Roles.rolesFor(identity)` and `grantsFor(identity)` lose their context argument and only read the database.

**Changing a role's members.**

```ts
ctx.roles.syncMembers(role: string, dids: string[]): Promise<{ added: number; removed: number }>
ctx.roles.addMember(role: string, did: string): Promise<void>
```

- `syncMembers` changes the role in one transaction: it removes every member not in `dids`, including rows an admin added, and adds every DID in `dids` that has an account. Members in `dids` without an account stay, so someone added at sign-in isn't removed before their account is created.
- `addMember` adds one DID, whether or not it has an account.
- New rows have `added_by` set to `plugin:<pluginId>`. A DID already in the role keeps its row.
- Both throw for `admin`, so a plugin can't hand out admin rights, for a role that doesn't exist, and for any entry that isn't a syntactically valid DID. Nothing changes when they throw.

**The `signIn:before` hook.**

```ts
type ActionHooks = {
  'signIn:before': { did: string; handle?: string | null; pdsUrl: string }
  // …
}
```

The OAuth callback runs it before reading roles for the access check, and waits at most 10 seconds for all handlers together. A handler that throws or is still running then is logged, and sign-in goes ahead with the roles stored now.

### The registry

The plugin makes one call:

```
GET <url>/xrpc/network.sharedcomputer.membership.listMembers?activeOnly=true&token=<token>
```

The registry resolves its grant and revocation log and answers with the current members:

```json
{ "members": [{ "did": "did:plc:…", "active": true, "tier": "level-0", "grantedAt": "…" }] }
```

The plugin only reads `did`. On failure the registry answers with a non-2xx status and a body like `{ "error": "script_error", "message": "…" }`. That includes a missing or empty admin roster, so a successful empty `members` list means there really are no members.

The token is a script variable named `MEMBERS_TOKEN_<CONSUMER>` on the HappyView instance, issued by the registry's operators. The call goes to the public URL, so the token appears in HappyView's edge logs. That is accepted, since SCN Chat can't depend on reaching HappyView at an internal address.

### The plugin

```ts
z.object({
  url: z.url({ protocol: /^https$/ }).default('https://view.sharedcomputer.network'),
  token: z.string().min(32).meta({ secret: true }),
  role: z.string().min(1).default('scn-member'),
}).strict()
```

The plugin ID is `scn-member-registry`, and the package can be added once. It syncs on `cron` and `signIn:before`:

- Fetch the list, with an 8-second timeout, and validate it with zod: `members` must be an array of objects with a string `did`.
- Call `syncMembers(role, dids)`. When the list is empty and `removed` is more than zero, log an error saying every member lost the role.
- At sign-in, also call `addMember(role, did)` when the person signing in is in the list.
- On a network error, a non-2xx answer, a response that fails validation, or an error from core, change nothing and log a warning with the HTTP status and the registry's error message. The URL is never logged, since it carries the token.
- A sync while one is in flight joins it. `onClose` aborts a fetch in flight.

The plugin keeps no copy of the list.

### Admin area

A role's page shows who added each member, so members the plugin added show `plugin:scn-member-registry`. Members can still be added and removed by hand. The next sync removes anyone the registry doesn't list, and adds back any member with an account.

### Setting up SCN

1. The registry's operators add a `MEMBERS_TOKEN_SCN_CHAT` script variable on HappyView.
2. An admin creates the `scn-member` role, adds the plugin with the token, sets registration to `invite` with `scn-member` as an invite role, and limits admin models and the admin's web search engine to `scn-member`.
3. An admin sets up [[cron]].

### Documentation

- `plugins/scn-member-registry/README.md` covers the options, the token, and the setup above.
- `docs/plugins.md` replaces role sources with `ctx.roles.syncMembers` and `ctx.roles.addMember`, and documents `signIn:before`. The admin and plugins specs drop role sources.

## Scope Boundaries

- No suspensions. A revocation removes the role and nothing else.
- No tiers. Every member gets the one role.
- No locking of the role in the admin area. Hand edits are overwritten on the next sync.
- No push from the registry. Outside sign-in, a grant or revocation takes effect at the next cron run.
- No storing members who haven't signed in. A member without an account joins the role when they first sign in.
- No internal-address or custom Host header option. The plugin calls the public URL.
- No status display for the plugin in the admin area. A bad token or an unreachable registry shows in the server log.
- No reading of the registry's raw log through `syncMembers`, and no resolution of grants and revocations in the plugin. The registry resolves membership.
- No handling of applications. Applying is done in Corliss.

## Edge Cases and Decisions

- Every sign-in fetches the list, so a burst of sign-ins shares one fetch.
- While HappyView is down, the stored members keep the role, so an outage doesn't lock anyone out, and revocations made during the outage wait for it to end. A newly added plugin grants nothing until its first sync.
- Someone who has an account, such as one an admin added, and becomes an SCN member later gets the role at the next cron run.
- A successful empty list removes the role from everyone. It's applied, since the registry errors rather than answering empty when its roster is broken, but logged as an error.
- Disabling or removing the plugin leaves the last stored members in place.
- Two plugins syncing the same role overwrite each other. That's the admin's choice to make.
- PDS hosts and handle domains on the role still grant it, alongside the plugin's members.

## Acceptance Criteria

Core:

- [ ] `syncMembers` removes members not in the list, including hand-added ones, adds listed DIDs that have an account, keeps listed members without one, and reports how many were added and removed.
- [ ] `syncMembers` and `addMember` throw and change nothing for `admin`, a missing role, or an entry that isn't a DID.
- [ ] Role checks read the stored members and never call a plugin.
- [ ] `signIn:before` runs before the access check, so a member a handler stores can create an account.
- [ ] A `signIn:before` handler that throws or takes longer than 10 seconds doesn't stop the sign-in.

The plugin:

- [ ] A sync asks the registry for active members with the token and syncs the role with their DIDs.
- [ ] A member signing in is added to the role before the access check, and someone not in the list isn't.
- [ ] Cron syncs without adding anyone who hasn't signed in.
- [ ] A network error, a non-2xx answer, or a malformed list changes nothing and logs a warning that doesn't contain the token.
- [ ] A successful empty list replacing members is stored and logged as an error.
- [ ] Concurrent syncs share one fetch.

## Files

- `plugins/scn-member-registry/`
- `package.json`, for the dependency
- `apps/server/src/auth/roles.ts`, `apps/server/src/auth/routes.ts`
- `apps/server/src/plugins/host.ts`, `apps/server/src/server.ts`
- `packages/plugin-api/src/index.ts`, `packages/plugin-api/src/testing.ts`
- `apps/web/src/features/admin/`, `apps/web/src/routes/_app/admin/`
- `specs/admin.md`, `specs/plugins.md`, `specs/admin-plugins.md`, `docs/plugins.md`
