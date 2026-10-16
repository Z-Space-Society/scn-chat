/** Why a release can't be cut, worded for whoever ran it. */
export class ReleaseError extends Error {}

const parse = (version: string) => version.split('.').map(Number)

/** Whether `next` comes after `current`, comparing major, then minor, then patch. */
function isNewer(next: string, current: string) {
  const [a, b] = [parse(next), parse(current)]
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

const UNRELEASED = '## [Unreleased]\n'
/** Where Unreleased ends: the next version's heading, or the links at the bottom. */
const SECTION_END = /\n## \[|\n\[Unreleased\]: /
const UNRELEASED_LINK = /^\[Unreleased\]: (\S+)\/compare\/(\S+)\.\.\.HEAD$/m

/**
 * The changelog with Unreleased dated as `version`, a new empty Unreleased above it, and the
 * compare links at the bottom moved on, and that version's section as its release notes.
 */
export function cutRelease(changelog: string, current: string, version: string, date: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new ReleaseError(`Give the version as major.minor.patch, like 0.2.0, not "${version}".`)
  if (!isNewer(version, current))
    throw new ReleaseError(`The version must be newer than ${current}, the current one.`)
  const start = changelog.indexOf(UNRELEASED)
  if (start === -1) throw new ReleaseError('CHANGELOG.md has no "## [Unreleased]" section.')
  const bodyStart = start + UNRELEASED.length
  const rest = changelog.slice(bodyStart)
  const end = rest.search(SECTION_END)
  const body = (end === -1 ? rest : rest.slice(0, end)).trim()
  if (!body) throw new ReleaseError('Unreleased is empty, so there is nothing to release.')
  const after = end === -1 ? '' : rest.slice(end + 1)
  const link = UNRELEASED_LINK.exec(after)
  if (!link) throw new ReleaseError('CHANGELOG.md has no "[Unreleased]: …/compare/…...HEAD" link.')
  const [line, base, previous] = link
  const links = `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/compare/${previous}...v${version}`
  return {
    changelog: `${changelog.slice(0, start)}${UNRELEASED}\n## [${version}] - ${date}\n\n${body}\n\n${after.replace(line, links)}`,
    notes: `${body}\n`,
  }
}
