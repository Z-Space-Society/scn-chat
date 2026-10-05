# SCN Member Registry

## Summary

The `@scn-chat/plugin-scn-member-registry` plugin gives every active member of the Shared Computer Network a role in SCN Chat. It reads the member list from the SCN member registry, a set of Lua scripts and lexicons running on a HappyView instance, by calling its `listMembers` query with a service token. It refreshes the list on a timer and whenever someone signs in. The role is meant to be an invite role, so that only SCN members can create an account, and to limit admin models and other admin-paid features to members.

## Motivation

SCN members apply with a public record on their own PDS and are approved or revoked by SCN admins in Corliss, which writes grants and revocations into the registry's permissioned space on HappyView. The admin spec's role sources exist so that SCN Chat can honor those decisions without an admin copying each one by hand.

A revocation in the registry only removes the role. The account stays, along with any role an admin gave by hand, so a revoked member keeps what's open to everyone, such as their own API keys, and loses what's limited to the role. Suspending is left to admins.

HappyView must not slow down requests or break chat when it's down, so the plugin answers role questions from its own copy of the list. Sign-in is the exception: it fetches a fresh copy first, so someone approved a minute ago can sign up right away.

## Design

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

### Options

```ts
z.object({
  url: z.url({ protocol: /^https$/ }).default('https://view.sharedcomputer.network'),
  token: z.string().min(32).meta({ secret: true }),
  role: z.string().min(1).default('scn-member'),
  pollMinutes: z.number().int().min(1).max(35_000).default(5),
}).strict()
```

`role` names a role an admin created on the Roles page. Core ignores, with a warning, any role a source returns that doesn't exist. The plugin ID is `scn-member-registry`, and the package can be added once.

### Fetching

A fetch:

- Times out after 8 seconds, inside core's 10-second role source limit.
- Joins the fetch already in flight, if there is one, rather than starting another.
- Validates the response with zod: `members` must be an array of objects with a string `did`. A response that fails is a failed fetch.
- On success, replaces the in-memory set of member DIDs. When the new list is empty and the previous one wasn't, it logs an error saying every member lost the role.
- On failure, keeps the previous set and logs a warning with the HTTP status and the registry's error message. The URL is never logged, since it carries the token.

`setup` starts the first fetch without waiting for it, and a timer fetches every `pollMinutes` after the last fetch finished. A fetch at sign-in restarts the timer. `onClose` stops the timer and aborts a fetch in flight, so a runtime that is swapped out, or a candidate runtime that is refused, stops calling the registry.

### Role source

The plugin registers a role source with ID `scn-member-registry`:

- **At sign-in** it fetches, and answers from the result. If the fetch fails it answers from the previous set.
- **On other calls** it answers from the set: `[role]` for a member, `[]` otherwise. Before the first fetch has finished, it waits for it.

### Changes to core

The role source interface gains a context argument, so a source can tell sign-in from the checks on every request:

```ts
interface RoleSource {
  id: string
  rolesFor(identity: RoleIdentity, context: { signIn: boolean }): Promise<string[]>
}
```

`Roles.rolesFor(identity, context?)` passes the context to every source, defaulting to `{ signIn: false }`. The OAuth callback passes `{ signIn: true }`. Core's limit on each role source call goes from 2 seconds to 10, so a source can call a remote service at sign-in. A source that answers from its own copy still answers immediately on other calls.

`setupForTest` runs the plugin's `onClose` handlers through a returned `close()`.

### Setting up SCN

1. The registry's operators add a `MEMBERS_TOKEN_SCN_CHAT` script variable on HappyView.
2. An admin creates the `scn-member` role, adds the plugin with the token, sets registration to `invite` with `scn-member` as an invite role, and limits admin models and the admin's web search engine to `scn-member`.

### Documentation

- `plugins/scn-member-registry/README.md` covers the options, the token, and the setup above.
- The admin spec and `docs/plugins.md` describe the context argument and the 10-second limit.

## Scope Boundaries

- No suspensions. A revocation removes the role and nothing else.
- No tiers. Every member gets the one role.
- No push from the registry. Outside sign-in, a revocation takes effect within one poll interval.
- No internal-address or custom Host header option. The plugin calls the public URL.
- No status display in the admin area. A bad token or an unreachable registry shows in the server log.
- No reading of the registry's raw log through `syncMembers`, and no resolution of grants and revocations in the plugin. The registry resolves membership.
- No handling of applications. Applying is done in Corliss.

## Edge Cases and Decisions

- Every sign-in fetches the list, so a burst of sign-ins shares one fetch rather than making one each.
- While HappyView is down, members keep the role from the last successful fetch, so an outage doesn't lock anyone out, and revocations made during the outage wait for it to end. Before any fetch has succeeded, nobody gets the role.
- A successful empty list removes the role from everyone. It's applied, since the registry errors rather than answering empty when its roster is broken, but logged as an error.
- Saving any plugin rebuilds the runtime, which runs a new fetch. That is one extra call per save.
- The 10-second limit applies to every role source call, not only sign-in. A slow source slows every request, so sources keep their own copy for everything but sign-in.

## Acceptance Criteria

- [ ] A DID in the registry's list gets the configured role, and any other DID gets none.
- [ ] A sign-in fetches the list before answering, so a member added since the last fetch gets the role.
- [ ] Before the first fetch finishes, a role check waits for it.
- [ ] A failed fetch, a non-2xx answer, or a response that fails validation keeps the previous list and logs a warning that doesn't contain the token.
- [ ] A successful empty list replacing a non-empty one is applied and logged as an error.
- [ ] Concurrent fetches share one request.
- [ ] Closing the plugin stops polling.
- [ ] Core passes `{ signIn: true }` to role sources from the OAuth callback and `{ signIn: false }` elsewhere.

## Files

- `plugins/scn-member-registry/`
- `package.json`, for the dependency
- `apps/server/src/auth/roles.ts`, `apps/server/src/auth/routes.ts`
- `packages/plugin-api/src/index.ts`, `packages/plugin-api/src/testing.ts`
- `specs/admin.md`, `docs/plugins.md`
