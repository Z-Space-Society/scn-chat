// pnpm release <version> [--dry-run]: cut a release from CHANGELOG.md's Unreleased section, as
// docs/releasing.md describes. With --dry-run it checks everything and prints the notes, changing
// nothing.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cutRelease, ReleaseError } from './release.ts'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim()
/** Whether a command succeeds, its output kept quiet. */
const succeeds = (command: string, args: string[]) => {
  try {
    execFileSync(command, args, { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function release(args: string[]) {
  const version = args.find((arg) => !arg.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  if (!version)
    throw new ReleaseError('Usage: pnpm release <version> [--dry-run], as pnpm release 0.2.0')

  if (run('git', ['branch', '--show-current']) !== 'main')
    throw new ReleaseError('Releases are cut from main. Switch to main first.')
  if (run('git', ['status', '--porcelain']))
    throw new ReleaseError('The working tree has changes. Commit or stash them first.')
  run('git', ['fetch', '--quiet', 'origin', 'main', '--tags'])
  if (run('git', ['rev-list', '--count', 'HEAD..origin/main']) !== '0')
    throw new ReleaseError('main is behind origin/main. Pull first.')
  if (succeeds('git', ['rev-parse', '--quiet', '--verify', `refs/tags/v${version}`]))
    throw new ReleaseError(`The tag v${version} already exists.`)
  if (!succeeds('gh', ['auth', 'status']))
    throw new ReleaseError('The GitHub CLI is not signed in. Run gh auth login first.')

  const packagePath = join(root, 'package.json')
  const changelogPath = join(root, 'CHANGELOG.md')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string }
  const date = new Date().toLocaleDateString('en-CA')
  const cut = cutRelease(readFileSync(changelogPath, 'utf8'), pkg.version, version, date)

  console.log(`Release ${version} (${date}), after ${pkg.version}. Its notes:\n\n${cut.notes}`)
  if (dryRun) {
    console.log('Dry run: nothing was changed.')
    return
  }

  writeFileSync(changelogPath, cut.changelog)
  writeFileSync(packagePath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`)
  run('git', ['add', 'CHANGELOG.md', 'package.json'])
  run('git', ['commit', '--quiet', '-m', `Release ${version}`])
  run('git', ['tag', '-a', `v${version}`, '-m', `Release ${version}`])
  run('git', ['push', '--quiet', '--atomic', 'origin', 'main', `v${version}`])
  const notesPath = join(mkdtempSync(join(tmpdir(), 'scn-chat-release-')), 'notes.md')
  writeFileSync(notesPath, cut.notes)
  const url = run('gh', [
    'release',
    'create',
    `v${version}`,
    '--title',
    `v${version}`,
    '--notes-file',
    notesPath,
  ])
  console.log(`Released ${version}: ${url}`)
}

try {
  release(process.argv.slice(2))
} catch (err) {
  if (!(err instanceof ReleaseError)) throw err
  console.error(err.message)
  process.exitCode = 1
}
