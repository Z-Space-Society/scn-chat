# Versions and releases

SCN Chat has one version, the `version` in the root `package.json`, and it follows [Semantic Versioning](https://semver.org/). The workspace packages under `apps/` and `packages/` are private parts of the app and carry no version of their own. Each plugin keeps its own version in its `package.json`, which the admin's plugin list shows, and bumps it when the plugin changes.

While the version is 0.x, a minor release, such as 0.2.0, carries new features or anything someone running a deployment must act on, such as a new environment variable, a migration that needs attention, or a lexicon change that needs a fresh login. A patch release, such as 0.1.2, carries fixes and small changes only.

## Recording changes

`CHANGELOG.md` is the record. Each commit that changes something a user, an admin, or a forker would notice adds a line under **Unreleased**, in the same commit, under one of:

- **Added** for something new.
- **Changed** for something that works or looks different.
- **Fixed** for a bug that no longer happens.
- **Removed** for something that is gone.
- **Security** for a vulnerability fixed.

A line says what the person sees, in a sentence or two, like the start of a commit message without its reasoning. A change that only refactors, tests, or tidies leaves the changelog alone, and several commits that build one feature share one line. Anything a deployment must act on says so in its line.

## Cutting a release

Pick the version by the rules above, from what Unreleased holds, then run:

```sh
pnpm release 0.2.0 --dry-run   # checks everything and prints the notes, changing nothing
pnpm release 0.2.0
```

It refuses unless you are on `main` with a clean working tree, up to date with `origin/main`, signed in to the GitHub CLI, the version is newer than the current one and has no tag yet, and Unreleased holds something. Then it:

1. Renames Unreleased in `CHANGELOG.md` to the version and today's date, starts a new empty Unreleased above it, and moves the compare links at the bottom on.
2. Sets the root `package.json` version to match, and commits both as "Release 0.2.0".
3. Tags that commit with an annotated tag, `v0.2.0`, so the tag records who cut it and when.
4. Pushes the commit and the tag together.
5. Publishes a GitHub Release for the tag, titled `v0.2.0`, with that version's section as its notes.

The code is in `packages/release`.
