# Specs

Each file here describes one feature of SCN Chat: what it does, why it exists, how it is built, what it deliberately leaves out, and how to tell it works. A spec is written and agreed on before the feature is built, and kept current as the feature changes.

Specs are the source of truth for behavior. When code and spec disagree, one of them is wrong, and the fix is to bring them back in line rather than let them drift. A spec should be detailed enough that someone, or an LLM, could rebuild the feature from it plus the project's `CLAUDE.md`.

These files are all AI generated and maintained.

The overview at the end of this file lists every spec and whether it is active, planned, or done.

## Sections

- **Summary**: what the feature does, for someone meeting it for the first time.
- **Motivation**: the problem it solves, with enough context to make good judgment calls.
- **Design**: the technical approach, data shapes, and where the code lives.
- **Scope Boundaries**: what the feature does not do.
- **Edge Cases and Decisions**: a running log of non-obvious choices.
- **Acceptance Criteria**: checks that each become at least one test.
- **Files**: the code that implements the feature, used to spot specs that have fallen behind the code.

## Overview of Feature Specs

### Active

- [[web-ui]]: rebuilding the web app on TanStack Start inside Hono, at parity with its acceptance criteria. Phase 1 of the web rebuild.

### Planned

The later phases of the web rebuild, each spec written before its phase starts:

- web-plugins: Renderers, Slots, and settings panels from plugins' web halves, registered in a fork. Lifts the plugins spec's "no UI" boundary.
- themes: the styling stack, the design token contract, a default theme, and Overrides, then themes users pick or import, saved in their settings.

### Completed

Phase 1, initial build-out, implemented and tested, awaiting a check against a real spaces PDS:

- [[foundation]]
- [[plugins]]
- [[auth]]
- [[chat-storage]]
- [[providers]]
- [[chat-turns]]
- [[attachments]]
- [[titles]]
- [[sharing]]
- [[browser-store]]

After the initial build-out:

- [[search]]
- [[web-search]]
