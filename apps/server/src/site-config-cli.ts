import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { text } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { issueApiKey, revokeApiKey } from './auth/api-keys.ts'
import { ADMIN_ROLE } from './auth/roles.ts'
import { DEFAULT_DATABASE_URL } from './config.ts'
import { createDb } from './db/index.ts'

const CLI_LABEL = 'site-config CLI'
// Age of a CLI key before a later run clears it out.
const STALE_MS = 60 * 60_000
const USAGE =
  'Usage: site-config export [--url <server>]\n       site-config apply [file] [--url <server>]'

// Resolve the file from where the command ran, and the server's own paths from its package.
const callerDir = process.env.INIT_CWD ?? process.cwd()
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
if (existsSync('.env')) process.loadEnvFile('.env')
else if (existsSync('../../.env')) process.loadEnvFile('../../.env')

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: 'string' } },
})
const [command, file, ...extra] = positionals
if (
  !(command === 'export' || command === 'apply') ||
  extra.length ||
  (command === 'export' && file)
) {
  console.error(USAGE)
  process.exit(2)
}

/** Stop with a problem in how the CLI was run. */
function misuse(message: string): never {
  console.error(message)
  process.exit(2)
}

if (command === 'apply' && !file && process.stdin.isTTY)
  misuse(`Give the file to apply, or pipe it in.\n${USAGE}`)
const server = values.url ?? `http://127.0.0.1:${process.env.PORT || 3000}`
if (!URL.canParse(server)) misuse(`--url ${server} isn't a URL, such as http://127.0.0.1:3000.`)
const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL
const sqlitePath = databaseUrl.startsWith('sqlite:') ? databaseUrl.slice('sqlite:'.length) : null
if (sqlitePath && !existsSync(sqlitePath))
  misuse(
    `There's no database at ${resolve(sqlitePath)}. Set DATABASE_URL to the server's database.`,
  )

const body =
  command === 'apply'
    ? file
      ? readFileSync(resolve(callerDir, file), 'utf8')
      : await text(process.stdin)
    : undefined

/** Call the running server with the key, print what it says, and return the exit code. */
async function run(key: string): Promise<number> {
  let response: Response
  try {
    response = await fetch(new URL('/api/admin/config', server), {
      method: command === 'export' ? 'GET' : 'PUT',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body,
    })
  } catch (err) {
    if (!(err instanceof TypeError)) throw err
    console.error(
      `Couldn't reach the server at ${server}. Is it running? Use --url if it listens elsewhere.`,
    )
    return 1
  }
  type Answer = { message?: string; changed?: boolean; changes?: string[]; warnings?: string[] }
  let result: Answer
  try {
    result = (await response.json()) as Answer
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    console.error(
      `${server} answered with something other than SCN Chat's API (${response.status}).`,
    )
    return 1
  }
  if (response.status === 401) {
    console.error(
      `${server} didn't accept the CLI's key, so it isn't using this database. Point --url at the server that uses the database in DATABASE_URL.`,
    )
    return 1
  }
  if (!response.ok) {
    console.error(result.message ?? `The server refused the request (${response.status}).`)
    return 1
  }
  if (command === 'export') console.log(JSON.stringify(result, null, 2))
  else console.log(result.changed ? (result.changes ?? []).join('\n') : 'No changes.')
  for (const warning of result.warnings ?? []) console.error(`Warning: ${warning}`)
  return 0
}

const db = createDb(databaseUrl)
// Clear out keys left by runs that were killed.
await db
  .deleteFrom('api_key')
  .where('created_by', '=', CLI_LABEL)
  .where('created_at', '<', new Date(Date.now() - STALE_MS).toISOString())
  .execute()
const { id, key } = await issueApiKey(db, { label: CLI_LABEL, roles: [ADMIN_ROLE] }, CLI_LABEL)
try {
  process.exitCode = await run(key)
} finally {
  await revokeApiKey(db, id)
  await db.destroy()
}
