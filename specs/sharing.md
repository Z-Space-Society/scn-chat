# Sharing

## Summary

A conversation's owner can share it read-only with specific people, by handle, or with anyone who has an atproto account. Sharing changes the conversation space's read policy and member list through `com.atproto.simplespace`, so the owner's PDS enforces it for every app, not just ours. A shared conversation opens at `/s/<ownerDid>/<skey>`. The viewer signs in, and the server reads the conversation with the viewer's own space credential, so the owner's PDS decides whether the viewer may see it. Sharing needs spaces on both sides: fallback users can neither share nor view shared chats.

## Motivation

Shareable read-only chats were on the original feature list. Letting the owner's PDS enforce access means another app can open a chat shared with you, and a chat stays shared or private however the owner changes it. Reading with the viewer's credential keeps SCN Chat free of its own access rules. Leaving fallback users out keeps the built-in code minimal, since the fallback exists only until PDSs support spaces.

## Design

### Share settings

A conversation has one of three sharing modes:

- **Private.** Only the owner. This is the default for new conversations.
- **People.** The owner plus a list of members.
- **Public.** Anyone with an atproto account.

`PUT /api/conversations/:skey/sharing` takes `{ mode, members?: string[] }`, where members are handles or DIDs. Handles are resolved to DIDs with `@atproto/identity`, and an unresolvable handle fails the request with 400, naming it. The server then updates the space through the owner's session:

- **Private.** `updateSpace` with `readPolicy: #memberListPolicy`, and `removeMember` for every current member.
- **People.** `updateSpace` with `#memberListPolicy`, `putMember` with `read: true, write: false` for each new member, and `removeMember` for anyone dropped.
- **Public.** `updateSpace` with `readPolicy: #publicPolicy`. The member list is kept, so switching back to people restores it.

The write policy stays `#memberListPolicy` with no writers, so only the owner's writes are ever tracked.

`GET /api/conversations/:skey/sharing` reads the state back with `getSpace` and `listMembers`, and returns the mode and members with each member's current handle. A change made in another app shows correctly.

Both routes return 403 with a message saying sharing needs a spaces PDS when the owner's storage mode is `local`.

### Viewing

`GET /api/shared/:ownerDid/:skey` requires a signed-in viewer whose storage mode is `space`. Otherwise it returns 403 with a message saying viewing shared chats needs a spaces PDS.

1. The server gets a delegation token from the viewer's PDS for the conversation space, through the viewer's session. The permission set's read access to conversation spaces of any authority allows this.
2. It exchanges the token for a space credential at the owner's PDS, the space authority, with the same DPoP code chat-storage uses for its own credentials. The owner's PDS applies the read policy and member list.
3. With the credential, it reads the owner's info record with `getRecord` and every message with `listRecords`, from the owner's PDS.
4. It returns the title and messages. The system prompt and the owner's preferences are left out. Tags live in the owner's private settings space, so viewers never see them. Any member can still read the system prompt through the protocol, since it is in the info record, so leaving it out is a presentation choice, not a privacy guarantee.

A refused credential (`UserNotAuthorized`), a missing space (`SpaceNotFound`), or a deleted one (`SpaceDeleted`) all return 404. A private conversation's existence is therefore not revealed. Viewer credentials are not cached, so revoking access takes effect on the viewer's next page load.

Attachments in a shared conversation are fetched the same way, with `getBlob` and the viewer's credential, through `GET /api/shared/:ownerDid/:skey/blobs/:cid`.

### Web UI

The conversation view has a share control showing the mode and members, with a copyable `/s/<ownerDid>/<skey>` link. It is hidden for fallback users. The shared view shows the conversation with branch navigation, the owner's handle, and no composer, regenerate, or edit controls.

## Scope Boundaries

- No sharing or viewing for fallback users.
- No anonymous viewing without an atproto account.
- No write access for members.
- No "shared with me" list. Viewers open shared chats by link.
- No notifications to members when a chat is shared.
- No forking a shared chat into the viewer's own conversations.
- No caching or syncing of other users' conversations.

## Edge Cases and Decisions

- Shared views are read with the viewer's own space credential, so the owner's PDS makes every access decision.
- Viewer credentials are minted per request and never cached, trading a little latency for immediate revocation.
- Switching to public keeps the member list, so switching back does not lose it.
- Refused, missing, and deleted conversations all return 404.
- A conversation owned by a user of a different app can be viewed too, as long as its space is a conversation space the viewer can read.

## Acceptance Criteria

- [ ] Sharing with people sets a member-list read policy and adds each member with read access and no write access.
- [ ] Removing a person removes their membership.
- [ ] Making a conversation public sets the public read policy and keeps the member list.
- [ ] Making it private again removes every member.
- [ ] An unresolvable handle fails with 400, naming it.
- [ ] Reading the share settings reflects changes made outside the app.
- [ ] A fallback owner gets 403 from both sharing routes.
- [ ] A fallback viewer gets 403 from the shared view.
- [ ] A signed-out request to the shared view returns 401.
- [ ] A member can view a people-shared conversation through their own space credential.
- [ ] Any spaces user can view a public conversation.
- [ ] A refused credential, a missing space, or a deleted space all return 404.
- [ ] After access is revoked, the viewer's next request returns 404.
- [ ] Attachments in a shared conversation load through the viewer's credential.
- [ ] The shared view's response has no system prompt.

## Files

- (to be populated during implementation)
