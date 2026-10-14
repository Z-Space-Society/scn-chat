import { createServer } from 'node:net'
import { isLoopbackUrl } from './auth/oauth-client.ts'

const DEFAULT_PORT = 3000
const TRIES = 20

/** Whether something already listens on the port at the host, or at every address without one. */
function isBusyAt(port: number, host?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    // Any other error, such as a host without IPv6, leaves the port to http.listen to judge.
    probe.once('error', (err: NodeJS.ErrnoException) => resolve(err.code === 'EADDRINUSE'))
    probe.listen(port, host, () => probe.close(() => resolve(false)))
  })
}

/**
 * Whether the port is taken. The loopback addresses are checked on their own, since macOS lets
 * a listener on every address share a port with one on 127.0.0.1, which then gets its requests.
 */
async function isBusy(port: number): Promise<boolean> {
  for (const host of [undefined, '127.0.0.1', '::1']) {
    if (await isBusyAt(port, host)) return true
  }
  return false
}

/** The first port from the given one up that nothing listens on. */
export async function findFreePort(port: number): Promise<number> {
  for (let candidate = port; candidate < port + TRIES && candidate <= 65535; candidate++) {
    if (!(await isBusy(candidate))) return candidate
  }
  throw new Error(`Ports ${port} to ${port + TRIES - 1} are all in use.`)
}

function urlPort(url: URL): number {
  if (url.port) return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

/**
 * When the app runs on this machine, move it to the next free port if its own is taken, and
 * PUBLIC_URL with it. A deployment, whose PUBLIC_URL is not loopback, keeps its port and fails
 * to start instead, since a reverse proxy points at that port.
 */
export async function withFreePort(
  env: Record<string, string | undefined>,
): Promise<Record<string, string | undefined>> {
  const port = Number(env.PORT || DEFAULT_PORT)
  // An invalid value is left for loadConfig to report.
  const publicUrl = URL.parse(env.PUBLIC_URL || `http://127.0.0.1:${DEFAULT_PORT}`)
  if (!publicUrl || !Number.isInteger(port) || port < 1 || port > 65535) return env
  if (!isLoopbackUrl(publicUrl.href) || urlPort(publicUrl) !== port) return env
  const free = await findFreePort(port)
  if (free === port) return env
  publicUrl.port = String(free)
  return { ...env, PORT: String(free), PUBLIC_URL: publicUrl.href.replace(/\/$/, '') }
}
