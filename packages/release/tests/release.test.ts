import { describe, expect, it } from 'vitest'
import { cutRelease, ReleaseError } from '../src/release.ts'

const changelog = `# Changelog

Intro.

## [Unreleased]

### Added

- A new thing.

### Fixed

- A bug.

## [0.1.1] - 2026-10-15

### Fixed

- An older bug.

[Unreleased]: https://github.com/o/r/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/o/r/compare/v0.1.0...v0.1.1
`

describe('cutRelease', () => {
  it('dates Unreleased as the version, opens a new Unreleased, and links both', () => {
    const { changelog: next } = cutRelease(changelog, '0.1.1', '0.2.0', '2026-11-02')
    expect(next).toBe(`# Changelog

Intro.

## [Unreleased]

## [0.2.0] - 2026-11-02

### Added

- A new thing.

### Fixed

- A bug.

## [0.1.1] - 2026-10-15

### Fixed

- An older bug.

[Unreleased]: https://github.com/o/r/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/o/r/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/o/r/compare/v0.1.0...v0.1.1
`)
  })

  it("gives the release's section as its notes", () => {
    expect(cutRelease(changelog, '0.1.1', '0.2.0', '2026-11-02').notes).toBe(
      '### Added\n\n- A new thing.\n\n### Fixed\n\n- A bug.\n',
    )
  })

  it('refuses a version that is not newer than the current one', () => {
    expect(() => cutRelease(changelog, '0.1.1', '0.1.1', '2026-11-02')).toThrow(ReleaseError)
    expect(() => cutRelease(changelog, '0.1.1', '0.1.0', '2026-11-02')).toThrow(/newer than 0.1.1/)
    expect(() => cutRelease(changelog, '0.9.0', '0.10.0', '2026-11-02')).not.toThrow()
  })

  it('refuses a version that is not plain major.minor.patch', () => {
    expect(() => cutRelease(changelog, '0.1.1', 'v0.2.0', '2026-11-02')).toThrow(/like 0.2.0/)
    expect(() => cutRelease(changelog, '0.1.1', '0.2', '2026-11-02')).toThrow(/like 0.2.0/)
  })

  it('refuses when Unreleased holds nothing to release', () => {
    const empty = changelog.replace(/### Added[\s\S]*?(?=## \[0\.1\.1\])/, '')
    expect(() => cutRelease(empty, '0.1.1', '0.2.0', '2026-11-02')).toThrow(/Unreleased is empty/)
  })
})
