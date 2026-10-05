# Admin

## Summary

SCN Chat gets an admin area in the web app, and the database starts holding the settings that used to live in `config.yml`. This spec builds the foundation the other admin specs sit on: a store for admin settings, a built-in `admin` role seeded from the environment, the admin area itself, and user access control. Roles move from `config.yml` into the database. A role's members can be listed one by one, matched by the PDS they use or their handle's domain, or decided by a plugin, such as one that checks an external membership system. A registration setting decides who can create an account: anyone, members of chosen roles, or only people an admin adds. Once someone has an account they keep it whatever the setting says, until an admin or a plugin suspends it. Anyone turned away is told why and given their DID to pass to an admin. Someone who signs in from a shared chat link gets a viewer session that can open shared chats and nothing else.

This is the first of three specs. [[admin-plugins]] moves plugins and admin models into the admin area, and [[admin-settings]] moves the remaining settings and removes `config.yml`.

## Motivation

Until now anyone with an atproto account could sign in, and a server had no way to limit that. SCN Chat is a community project, so servers differ: some are open to anyone, some only to a community's members, and some only to people an admin picks. Admin models and the admin's web search engine are gated by role either way, so an open server doesn't pay for strangers. Keeping roles as DID lists in `config.yml` doesn't scale either: every change means editing a file and restarting the server, and the admin has to find each person's DID by hand.

A community running its own PDS, or handing out handles under its own domain, wants all of its people let in without listing anyone. Explicit members cover everyone else. Some communities already decide membership elsewhere. SCN members apply through a public record and are approved by admins in HappyView, and the server should honor that without an admin copying each approval by hand. Plugins can therefore act as role sources. Groups are otherwise kept in a plain internal schema for now. Once an atproto group model settles, likely on spaces, roles migrate to it, either directly or through a role source plugin.

Sharing must keep working on a closed server. A shared chat is read with the viewer's own credential, so the viewer has to sign in, and the owner shouldn't need the viewer to be a member of the server first.

Settings follow one rule, learned from Open WebUI, which takes defaults from environment variables and then stores them in its database, so later changes to the environment are silently ignored. Here each setting lives in exactly one place. Values the server needs before the database is open, and secrets that protect the database, stay in the environment. Everything an admin changes while the server runs lives in the database and is edited in the admin area.

## Design

### Settings store

A generic key-value table holds admin settings that are not plugin instances or models:

```
app_setting (key text primary key, value_json text, updated_at, updated_by)
```

Each key has a zod schema in `apps/server/src/settings/schemas.ts`. Values are validated on write and on read. A stored value that fails its schema fails loudly: startup stops, naming the key. A migration must convert stored values whenever a schema changes incompatibly. Adding a field with a default needs no migration, because the default applies on read.

`apps/server/src/settings/store.ts` exports a `SettingsStore` that loads every key at startup and keeps the current values in memory, since there is one server process. `get(key)` returns the current value, or the schema's defaults when nothing is stored. `set(key, value, adminDid)` validates, writes, updates the in-memory copy, and notifies subscribers, so code that needs to react to a change, such as a scheduler, can subscribe. Every write is logged at info with the key and the admin's DID, and never the value.

This spec adds one key, `access`. [[admin-settings]] adds the rest.

### Bootstrap admins

`ADMIN_DIDS` in `.env` is a comma-separated list of DIDs. It is required: startup fails when it is empty or holds an invalid DID, since otherwise nobody could ever reach the admin area. The listed DIDs always hold the `admin` role, always have access, and cannot be removed in the admin area, which shows them as coming from the environment. This keeps an admin from locking everyone out.

### Roles

Roles move from `config.yml` to the database, and the `roles` section of `config.yml` is removed.

```
role (name text primary key, description text, pds_hosts_json text, handle_domains_json text, created_at, updated_at)
role_member (role, did, added_at, added_by), primary key (role, did)
```

- **Built-in roles.** `user` is implicit, held by everyone who has signed in, and is never stored. `admin` is created by the migration and cannot be deleted. Neither can be renamed.
- **Names.** Role names match `^[a-z][a-z0-9-]*$` and cannot be changed after creation, since settings and models refer to roles by name.
- **Members.** A role's members come from the sources below, and a DID holds the role if any of them matches:
  - **Explicit members** in `role_member`. The admin adds them by handle or DID, and the server resolves a handle to its DID when it is added. People who have never signed in can be added ahead of time.
  - **PDS hosts** in `pds_hosts_json`, a list of hostnames such as `pds.commonscomputer.com`. A DID matches when the host of its PDS URL, from its DID document, equals one of them exactly.
  - **Handle domains** in `handle_domains_json`, a list of domains such as `commonscomputer.com`. A DID matches when its verified handle is the domain or ends in `.` plus the domain. Only the owner of a domain can hand out handles under it, and the server only stores handles that resolve back to the same DID, so the match can't be claimed by someone outside the domain.
  - **Role sources** registered by plugins, described below.
- **Deleting.** Deleting a role is refused while access or any admin model names it, and the error lists them.

`apps/server/src/auth/roles.ts` becomes a `Roles` service. `rolesFor({ did, handle, pdsUrl })` returns `user`, `admin` when the DID is in `ADMIN_DIDS`, every role whose database sources match, and every role the plugin role sources grant. It reads the database and asks the role sources on every call, so a change applies on the user's next request without a new login. The PDS URL and handle come from the `account` row, which sign-in updates, or from identity resolution during sign-in, before the row exists.

### Role sources

A plugin can decide role membership from outside the database by registering a role source in `setup`:

```ts
interface RoleSource {
  id: string // unique among role sources, like other registries
  rolesFor(
    identity: { did: string; handle?: string; pdsUrl: string },
    context: { signIn: boolean },
  ): Promise<string[]>
}

ctx.roleSources.register(source)
```

- **When it runs.** Every `rolesFor` call asks every role source, in parallel, so a source is consulted at sign-in, before the access check, and on every request. A grant or revocation in the external system applies on the user's next request. `context.signIn` is true only for the check in the OAuth callback, so a source can fetch fresh data at sign-in and answer from its own copy the rest of the time.
- **Caching** belongs to the plugin. Core doesn't remember a source's answers, so a source backed by a remote service caches inside the plugin, for as long as it judges safe.
- **Failures.** Core gives each call 10 seconds, long enough to call a remote service at sign-in. A source that throws or times out contributes no roles for that call, and core logs a warning with the source ID and the DID. A plugin that wants to ride out an outage of its backend keeps its last good answer itself.
- **Names.** A source can only grant roles that exist. Unknown names and `admin` are ignored with a warning, so admin rights only ever come from the database and `ADMIN_DIDS`. A plugin that grants a role takes the role name as an option, so the admin picks it.
- **Plugin runtime.** Role sources live in the plugin host alongside providers and tools, so in [[admin-plugins]] they come from the current runtime, and saving a plugin's options changes them without a restart.
- **The admin area** shows a role granted by a source with the source's ID, and it can't be removed there.

### Registration

The `access` setting decides who can create an account:

```ts
access: {
  registration: 'open' | 'invite' | 'closed' // default 'open'
  inviteRoles: string[] // default [], used by 'invite'
}
```

| Mode | Who can create an account |
|---|---|
| `open` | Anyone with an atproto account. |
| `invite` | Anyone holding a role in `inviteRoles`, from any role source, and anyone an admin added. |
| `closed` | Only people an admin added. |

Creating an account means a first full sign-in, which records the account and runs the login hook. Admins can always create one. Every name in `inviteRoles` must be an existing role, checked on save.

**Access follows the account.** A user has full access to the chat app when they are an admin, or have an account that is neither viewer-only nor suspended. Changing the mode, or a user losing a role, doesn't take access away from anyone who already has an account. Removing someone is a suspension.

### Added users

An admin adds a person by handle or DID, and that person can then create an account in any mode. That is what makes `closed` usable, and it's a shortcut in `invite` mode.

```
account_invite (did text primary key, added_by, added_at)
```

The row is deleted when the person creates their account. Adding a DID that already has a full account is refused, since they already have access. An added person who hasn't signed in yet can be removed again.

### Suspension

A suspended account keeps its data and its OAuth session but loses access, so the server stops acting for it. Its owner can still sign in to view chats shared with them. The `account` table gains `suspended_at`, `suspended_by`, and `suspended_reason`, all null when the account isn't suspended. `suspended_by` is an admin's DID, or `plugin:<id>` for a plugin.

- **Admins** suspend and restore accounts on the Users page, with an optional reason.
- **Plugins** call `ctx.accounts.suspend(did, { reason })` and `ctx.accounts.restore(did)`, so a plugin that tracks membership elsewhere can act on a revocation. Core doesn't suspend anyone by itself. Both return whether an account changed.
- **Admins can't be suspended**, by an admin or a plugin, so nobody can lock the admins out. Remove the admin role first. Suspending someone who has no account is a no-op.
- **Reasons are admin notes.** They are shown on the Users page and never to the suspended user, so they can hold internal details.
- **The Users page** shows who suspended an account and why, and an admin can restore any suspension, including a plugin's. A plugin that still disagrees can suspend the account again.

### Viewers

Anyone can sign in to view a chat shared with them, whether or not they have access. A user who signs in without access, through a share link, becomes a viewer:

- **Shared routes.** A viewer can reach `GET /api/me`, `POST /api/logout`, and the `/api/shared` routes from the sharing spec, and nothing else. The owner's PDS still decides whether they may see the chat.
- **No setup.** A viewer's sign-in skips the login hook, so the server creates no settings space for them, doesn't register for their notifications, and never syncs, stores, or runs turns for them.
- **Account flag.** The `account` table gains `viewer_only`, set when an account is created by a viewer sign-in, and cleared when they create a full account, which runs the login hook. A viewer who later may create an account is asked to sign in again, so the login hook always runs before they use the chat app.

### Checking access

Access is checked in three places:

- **Sign-in.** `GET /oauth/callback` resolves the identity, as it does today, then decides before it creates or updates the account or a web session:
  - An admin, or an existing full account that isn't suspended, signs in as today.
  - Anyone else who may create an account under the current mode creates it: the sign-in clears `viewer_only`, runs the login hook, and deletes their `account_invite` row.
  - Anyone else whose `next` parameter is a share path, `/s/<ownerDid>/<skey>`, signs in as a viewer and returns to the shared chat.
  - Anyone else has their new OAuth session revoked and goes back to the login page with a message. No account row is created for them.
- **Every `/api` request.** The session middleware resolves the account, then checks access for every route a viewer can't reach. A user without full access gets 403 `{ error: 'AccessDenied', message }`. Their web session is kept, so shared chats still open. The web app shows the message, with sign-out and sign-in buttons, in place of the chat app on every route except shared chats.
- **Background work.** The turn runner doesn't start a turn for a user without full access, and logs the skip at info. The sync scheduler, discovery, and notification registration skip them the same way.

The messages, which name the user's DID so they can pass it to an admin:

| Situation | Message |
|---|---|
| Suspended | "Your account has been suspended. Contact an admin for details." |
| A viewer who may now create an account | "Sign in again to start using chat." |
| `invite` mode | "This server is invite-only. Ask an admin to add you, and give them your DID: did:plc:..." |
| `closed` mode | "This server isn't taking new accounts. Ask an admin to add you, and give them your DID: did:plc:..." |

### Admin checks

`requireAdmin` middleware guards every `/api/admin` route and returns 403 `{ error: 'Forbidden' }` when the user doesn't hold `admin`. `GET /api/me` gains `admin: boolean`, `access`, and `accessMessage`, the message a viewer sees, or null.

### Admin API

| Route | Purpose |
|---|---|
| `GET /api/admin/users?q=&cursor=` | Accounts, 50 at a time, newest activity first. Each has the DID, handle, storage mode, whether it is a viewer, its suspension, roles, and each role's source, including role sources, which are asked for each listed account, plus created and last-active times. `q` matches the start of a handle or DID. |
| `POST /api/admin/users` | Add a person from `{ identifier }`, a handle or DID, so they can create an account. |
| `GET /api/admin/invites`, `DELETE /api/admin/invites/:did` | People added who haven't created an account yet, and removing one. |
| `POST /api/admin/users/:did/suspend`, `POST /api/admin/users/:did/restore` | Suspend an account with an optional `{ reason }`, or restore it. |
| `GET /api/admin/roles` | Every role, with its description, explicit members with their handles, PDS hosts, and handle domains. `admin` also lists the DIDs from the environment, marked as such. |
| `POST /api/admin/roles` | Create a role from `{ name, description }`. |
| `PATCH /api/admin/roles/:name` | Change `description`, `pdsHosts`, or `handleDomains`. Hosts and domains must be valid hostnames. |
| `DELETE /api/admin/roles/:name` | Delete a role, refused for built-in roles and roles still in use. |
| `POST /api/admin/roles/:name/members` | Add a member from `{ identifier }`, a handle or DID. A handle that doesn't resolve is a 400 naming it. |
| `DELETE /api/admin/roles/:name/members/:did` | Remove an explicit member. Refused for DIDs from `ADMIN_DIDS`. |
| `GET /api/admin/access`, `PUT /api/admin/access` | Read and change the `access` setting. |

Writes are validated with zod, and a failure is a 400 with `{ error: 'InvalidRequest', issues: [{ path, message }] }`, so forms can show each message next to its field. That shape is shared by every admin form in the admin specs.

### Admin area

The web app gets an admin area at `/admin`, visible only to admins. It reuses the settings layout: a sidebar in the same style as the chat list, linking back to the chats and to each section, with only the current section shown. Non-admins who open an `/admin` route are redirected to `/`. The settings sidebar shows an "Admin" link for admins.

Sections in this spec:

- **Users** (`/admin/users`, the default). A form to add a person by handle or DID, the list of people added who haven't signed in yet, a search box, and a table of accounts with their handle, DID, storage mode, roles, last activity, and suspension, with viewers marked, and a "Load more" button. Each row can add the user to a role, remove them from one they hold explicitly, and suspend or restore them. Roles that come from a PDS host, handle domain, or role source are shown with their source but can't be removed there.
- **Roles** (`/admin/roles`). One block per role: its description, explicit members with a remove button, an input to add a member by handle or DID, and the PDS hosts and handle domains, one per line. A form at the end creates a role.
- **Access** (`/admin/access`). The registration mode, a checkbox per role for `inviteRoles`, shown in `invite` mode, and a Save button.

The UI stays as bare as the rest of the web app.

### Environment

| Variable | Purpose |
|---|---|
| `ADMIN_DIDS` | Comma-separated DIDs that always hold `admin`. Required. |

### Docs

`docs/architecture.md` gains a section on the admin area, access and viewers, and the split between environment and database settings. `docs/plugins.md` and the plugins spec document `ctx.roleSources.register`, and `setupForTest` records role sources like other registrations. `docs/deployment.md` explains `ADMIN_DIDS` and that a new server is open until an admin changes the registration mode. `docs/plugins.md` and the plugins spec document `ctx.accounts`. The sharing spec notes that viewers don't need access.

## Scope Boundaries

- No anonymous viewing. Viewers sign in, since the owner's PDS only grants reads to a user.
- No invite codes or links, and no sign-up requests for admins to approve.
- No suspending accounts automatically in core. A plugin can do it.
- No per-role limits on usage, quotas, or billing.
- No audit log table. Admin changes are written to the server log.
- No built-in roles from atproto lists, follows, or external group services. A role source plugin can provide them, and none ships with this spec.
- No caching of role source answers in core.
- No separate admin permissions. Every admin can change everything.
- No settings export or import.
- No multi-process deployments. The settings store assumes one server process.

## Edge Cases and Decisions

- `ADMIN_DIDS` is the one role source in the environment, so a broken database state or a mistaken edit can't lock every admin out.
- A new server is open, since servers run by different communities want different things, and an open server is what most people expect when they try it.
- The mode only decides who can create an account. Access follows the account, so changing the mode never cuts anyone off, and a lost role doesn't either. Removing someone is an explicit suspension, by an admin or a plugin.
- A plugin acts on a revocation elsewhere by suspending the account, on its own schedule. Vetoing access on every request instead would mean an outage of the plugin's backend either locked members out or let revoked people in.
- Admins always have access and can't be suspended.
- The suspended message is fixed. Sign-in errors travel in the login page's query string, so they end up in browser history and proxy logs, and a reason could hold internal details or text from a plugin's external system.
- A suspended user keeps their OAuth session and their data. The server only stops acting for them, and they can still view chats shared with them.
- A user turned away at sign-in has their OAuth session revoked, so the server never holds tokens for people it turned away. Viewers keep theirs, since reading a shared chat needs it.
- The access check happens at the callback, not before the redirect, because only the callback proves which DID signed in.
- Only a share path in `next` makes a viewer, so the login page never creates one.
- A viewer who later may create an account must sign in again, so the login hook creates their settings space before they use the chat app.
- PDS host matching uses the PDS from the DID document. Handle domains match the verified handle stored at each sign-in, so someone who moves to a handle outside the domain keeps the role until they next sign in.
- Role names are fixed at creation, since other settings refer to them by name.
- Admin error messages are shown to the admin as they are, so `InvalidBody` carries the message without a prefix, and its `issues` with the field paths.
- The users list pages with an offset cursor. Accounts are few enough that keyset paging isn't worth it.
- The user search matches the lowercased query against handles and DIDs with `LIKE`, escaping `%` and `_`.
- Role sources are asked on every check instead of storing what they grant, so a revocation in the external system applies without anyone removing a stored membership.
- A failing role source grants nothing, so an outage can lock its members out once the plugin's own cache runs out. Granting stale roles from core would hide the outage and keep revoked users in.
- Role sources can't grant `admin`, so a plugin can't hand out admin rights.
- An added person's row is kept until they create an account, so adding someone in `open` mode, where they don't need it, does no harm.
- Deleting a role that a plugin's options name isn't checked, since core can't tell which options are role names. The source's grants of it are then ignored with a warning.

## Acceptance Criteria

Settings store:

- [ ] A setting that was never stored reads as its schema's defaults.
- [ ] A write that fails the schema is refused, and a valid write is visible to `get` at once and notifies subscribers.
- [ ] A stored value that fails its schema stops startup, naming the key.

Bootstrap admins:

- [ ] Startup fails when `ADMIN_DIDS` is empty or holds an invalid DID.
- [ ] A DID in `ADMIN_DIDS` holds `admin`, has access whatever the registration mode says, and can't be removed through the API.

Roles:

- [ ] `rolesFor` returns `user`, plus every role whose explicit members, PDS hosts, or handle domains match.
- [ ] A PDS host matches the host of the PDS URL exactly, and not a subdomain.
- [ ] A handle domain matches the domain itself and its subdomains, and not a name that only ends with the same letters.
- [ ] Adding a member by handle stores the handle's DID, and a handle that doesn't resolve is a 400.
- [ ] A role change applies on the user's next request without a new login.
- [ ] Creating a role with an invalid name is refused, and built-in roles can't be deleted.
- [ ] Deleting a role named by access or an admin model is refused, listing what names it.

Role sources:

- [ ] Roles a source grants are included in `rolesFor`, and count as invite roles at sign-in.
- [ ] A source's change in answer applies on the user's next request.
- [ ] A source that throws or takes longer than 10 seconds contributes no roles and logs a warning, and the other sources still count.
- [ ] Role sources get `{ signIn: true }` from the OAuth callback and `{ signIn: false }` everywhere else.
- [ ] Unknown role names and `admin` from a source are ignored with a warning.
- [ ] Registering two role sources with the same ID fails, like other registries.
- [ ] The users list shows roles from a source with the source's ID, and doesn't offer to remove them.

Registration and access:

- [ ] A fresh install is open, and anyone can create an account.
- [ ] In `invite` mode, holders of an invite role and added people can create an account, and anyone else is turned away with the invite-only message naming their DID.
- [ ] In `closed` mode, only added people and admins can create an account, and anyone else is turned away with the closed message.
- [ ] A turned-away user's OAuth session is revoked and no account row is created.
- [ ] An existing account keeps access when the mode changes and when it loses a role.
- [ ] Creating an account deletes the added person's row.
- [ ] `inviteRoles` naming a role that doesn't exist is refused.
- [ ] The turn runner doesn't start a turn for a user without full access, and the sync scheduler and discovery skip them.

Added users and suspension:

- [ ] An admin adds a person by handle or DID, and adding someone who already has an account is refused.
- [ ] An added person who hasn't signed in can be removed.
- [ ] A suspended account gets 403 `AccessDenied` with the suspended message, never its reason, keeps its web session for shared chats, and gets no turns or sync.
- [ ] A suspended user who signs in from the login page is turned away with the suspended message, and from a share link gets a viewer session.
- [ ] Restoring an account gives it access again on its next request.
- [ ] Admins can't be suspended, by an admin or a plugin.
- [ ] `ctx.accounts.suspend` and `restore` change the account, record `plugin:<id>`, and return whether an account changed.

Viewers:

- [ ] A user who may not create an account and signs in with a share path in `next` gets a viewer session and returns to the shared chat.
- [ ] A viewer can open a chat shared with them and gets 403 `AccessDenied` from every other route except `/api/me` and logout.
- [ ] A viewer sign-in creates no settings space and runs no sync.
- [ ] `GET /api/me` reports `access: 'viewer'` for a viewer and `'full'` for a user with access.
- [ ] A viewer who may now create an account is told to sign in again, and that sign-in runs the login hook and clears the flag.
- [ ] A user with access who signs in through a share link gets a full session.

Admin API and area:

- [ ] Every `/api/admin` route returns 403 for a user who isn't an admin.
- [ ] `GET /api/me` includes `admin`.
- [ ] A write that fails validation returns 400 with the issue paths and messages.
- [ ] The users list pages 50 at a time and filters by handle or DID prefix.
- [ ] The admin area redirects non-admins to `/`, and the settings sidebar shows the Admin link only to admins.
- [ ] The roles section adds and removes members, and saves PDS hosts and handle domains.
- [ ] The access section saves the registration mode and invite roles.
- [ ] The users section adds people, removes added people, and suspends and restores accounts.
- [ ] The web app shows the access message in place of the chat app for viewers, and still opens shared chats.

## Files

- `apps/server/src/settings/store.ts`, `apps/server/src/settings/schemas.ts`
- `apps/server/src/auth/roles.ts`, `apps/server/src/auth/access.ts`, `apps/server/src/auth/accounts.ts`, `apps/server/src/auth/invites.ts`
- `packages/plugin-api/src/index.ts`, `packages/plugin-api/src/testing.ts`, `apps/server/src/plugins/host.ts`
- `apps/server/src/auth/routes.ts`, `apps/server/src/auth/web-session.ts`
- `apps/server/src/admin/routes.ts`
- `apps/server/src/turns/runner.ts`, `apps/server/src/sync/scheduler.ts`
- `apps/server/src/config.ts`, `apps/server/src/server.ts`
- `apps/server/src/db/migrations/0007_admin.ts`, `apps/server/src/db/migrations/0009_registration.ts`
- `apps/web/src/pages/AdminPage.tsx`, `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/App.tsx`
- `.env.example`, `docs/architecture.md`, `docs/deployment.md`, `docs/plugins.md`, `specs/sharing.md`, `specs/plugins.md`
