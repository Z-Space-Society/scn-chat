# Changelog

What changed in each release of SCN Chat, for the people who use it, run it, or fork it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). `docs/releasing.md` says how a release is cut.

## [Unreleased]

### Changed

- A streaming reply's words fade in as they arrive, rather than appearing at once. Nothing moves under reduced motion.

## [0.2.2] - 2026-10-16

### Fixed

- A chat left open for a long time no longer keeps a copy of every reply it streamed in memory once the reply is saved.
- A long code block streaming into a reply uses about half the CPU it did, since each new character no longer re-renders and re-lays out every line above it.

### Changed

- For forkers: a tab reaches the browser store through `StoreClient.calls`, which has every method of the store's logic, rather than `StoreClient.worker`. Web tests run components over the real store through `testStore` in `apps/web/tests/helpers/store.ts`, rather than hand-built fakes.
- For forkers: a pending reply is drawn by `PendingReply.tsx` in the conversation feature, which `MessageView` uses while a record is pending, and which follows the conversation `FollowedConversation` names. `MessageView` and `BranchView` no longer take `pending` and `live` slots, and `LiveAuthor.tsx`, `ReplyStream.tsx`, and `StreamingReply.tsx` are gone.
- For forkers: the web app's message records are typed as the lexicon's `MessageRecord`, from the local copy through `BranchMessage` to the part and tool views, and `src/shared/message.ts` holds what a status means (`isPending`, `isFinished`), a message's parts, and who wrote it.

## [0.2.1] - 2026-10-16

### Changed

- The line under a reply that is waiting, such as "The model's provider is busy. Trying again…" or "Lost the live stream. Checking for the reply…", is in medium weight and breathes as the model's name does while it waits, so it reads as something still going.
- Each settings and admin page has its own browser-tab title, such as "API keys · Settings" or "Users · Admin", rather than every page sharing "Settings" or "Admin".
- Removing someone from a role asks to confirm first.

### Fixed

- Renaming a chat from the sidebar no longer saves an empty title, which kept the chat from ever being titled for you.
- Password managers no longer fill your password into a plugin's or a key's secret field, where it would replace the saved secret.
- Phone keyboards no longer capitalize or correct model IDs, handles, base URLs, and slugs as you type them in settings and admin.
- Add user, Add member, Add model, and Create role stay busy until they finish, so a second click no longer sends them twice.

## [0.2.0] - 2026-10-16

### Added

- A file attached to a message, such as a PDF, shows in the chat as the chip it was in the composer, with its name over its kind and size. A PDF opens in a new tab in the browser's own viewer, and any other file downloads under its name. Several files side by side share a row.
- `pnpm release <version>` cuts a release from this changelog: it dates the Unreleased section, bumps the version, tags the commit, and publishes the GitHub Release with that section as its notes. `docs/releasing.md` has the versioning rules.
- A provider that turns a request away with a rate limit or a server error is tried again for about a minute, and the reply says the provider is busy meanwhile. A key that has run out of credit or budget is not retried, and when it is the admin's key, the message suggests adding your own.

### Changed

- A reply's sources sit behind a count, a chip that opens onto a numbered list with one source to a line, rather than badges under the reply.
- A finished reply's steps open onto a quiet rail, with a dot for each step that is green when its tool finished, red when it failed, and grey for a thought, rather than a stack of numbered cards.

### Fixed

- Closing a thought, a step, or a reply's sources no longer pauses and then drops at the end.

## [0.1.1] - 2026-10-15

### Changed

- Selected text is a calm blue rather than the pale amber that search matches and the Stopped badge use.

### Fixed

- A footnote link scrolls to its note in the same reply, and the note's way back does the same, rather than opening the page in a new tab.

## [0.1.0] - 2026-10-15

The first tagged release.

[Unreleased]: https://github.com/Z-Space-Society/scn-chat/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/Z-Space-Society/scn-chat/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Z-Space-Society/scn-chat/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Z-Space-Society/scn-chat/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Z-Space-Society/scn-chat/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Z-Space-Society/scn-chat/releases/tag/v0.1.0
