# Changelog

What changed in each release of SCN Chat, for the people who use it, run it, or fork it. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). `docs/releasing.md` says how a release is cut.

## [Unreleased]

### Changed

- The line under a reply that is waiting, such as "The model's provider is busy. Trying again…" or "Lost the live stream. Checking for the reply…", is in medium weight and breathes as the model's name does while it waits, so it reads as something still going.

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

[Unreleased]: https://github.com/Z-Space-Society/scn-chat/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Z-Space-Society/scn-chat/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Z-Space-Society/scn-chat/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Z-Space-Society/scn-chat/releases/tag/v0.1.0
