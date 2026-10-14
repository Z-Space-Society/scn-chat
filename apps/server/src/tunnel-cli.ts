import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

// Runs the dev server behind a localhost.run tunnel, so a phone or another device can sign in over
// HTTPS. It needs only ssh and no account. The tunnel URL becomes PUBLIC_URL for this run only,
// and .env is left as it is. With --start it runs the built app in production instead, as
// `pnpm start` does. Not a Cloudflare quick tunnel, which holds back a reply's stream until it ends.

if (existsSync('.env')) process.loadEnvFile('.env')
else if (existsSync('../../.env')) process.loadEnvFile('../../.env')

if (!process.env.OAUTH_PRIVATE_KEYS) {
  console.error('OAUTH_PRIVATE_KEYS is required, since a tunnel URL needs a confidential client.')
  console.error('Generate one with `pnpm keys` and put it in .env.')
  process.exit(1)
}

const start = process.argv.includes('--start')
const args = process.argv.slice(2).filter((arg) => arg !== '--start')
const port = process.env.PORT || '3000'
const children: ChildProcess[] = []

/** Stop every child, then exit with the given code. */
function exit(code: number): never {
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => exit(0))
process.on('SIGTERM', () => exit(0))

const tunnel = spawn(
  'ssh',
  [
    // The first connection trusts localhost.run's host key rather than asking.
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ExitOnForwardFailure=yes',
    '-T',
    '-R',
    `80:localhost:${port}`,
    'nokey@localhost.run',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
children.push(tunnel)
tunnel.on('error', () => {
  console.error('ssh not found.')
  exit(1)
})
tunnel.on('exit', (code) => {
  console.error(`The tunnel closed with code ${code}. Run this again for a new URL.`)
  exit(code ?? 1)
})

// localhost.run prints the tunnel's URL once it has one.
const publicUrl = await new Promise<string>((resolve) => {
  let log = ''
  const timeout = setTimeout(() => {
    console.error(`localhost.run gave no tunnel URL within 30 seconds:\n${log}`)
    exit(1)
  }, 30_000)
  const read = (chunk: Buffer) => {
    log += chunk.toString()
    const match = log.match(/https:\/\/[a-z0-9-]+\.lhr\.life/)
    if (!match) return
    clearTimeout(timeout)
    for (const stream of [tunnel.stdout, tunnel.stderr]) {
      stream?.removeListener('data', read)
      stream?.resume()
    }
    resolve(match[0])
  }
  tunnel.stdout?.on('data', read)
  tunnel.stderr?.on('data', read)
})

console.log(`\nTunnel: ${publicUrl}\n`)

const server = spawn(
  process.execPath,
  start ? ['src/index.ts', ...args] : ['--watch', 'src/index.ts', ...args],
  {
    stdio: 'inherit',
    env: start
      ? { ...process.env, NODE_ENV: 'production', PUBLIC_URL: publicUrl }
      : {
          ...process.env,
          PUBLIC_URL: publicUrl,
          // Vite's dev server rejects requests for hosts it doesn't know.
          __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: new URL(publicUrl).hostname,
        },
  },
)
children.push(server)
server.on('exit', (code) => exit(code ?? 0))
