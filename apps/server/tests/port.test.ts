import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { findFreePort, withFreePort } from '../src/port.ts'

const servers: Server[] = []

/** Listen on a free port, at every address or only the host, and hold it until the test ends. */
async function occupy(host?: string): Promise<number> {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, host, resolve))
  return (server.address() as { port: number }).port
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
})

describe('findFreePort', () => {
  it('keeps a free port and skips a busy one', async () => {
    const busy = await occupy()
    expect(await findFreePort(busy)).toBeGreaterThan(busy)
    const free = await findFreePort(busy + 1)
    expect(await findFreePort(free)).toBe(free)
  })

  it('skips a port taken only on 127.0.0.1', async () => {
    const busy = await occupy('127.0.0.1')
    expect(await findFreePort(busy)).toBeGreaterThan(busy)
  })
})

describe('withFreePort', () => {
  it('moves a busy loopback port and PUBLIC_URL with it', async () => {
    const busy = await occupy()
    const env = await withFreePort({ PORT: String(busy), PUBLIC_URL: `http://127.0.0.1:${busy}` })
    const port = Number(env.PORT)
    expect(port).toBeGreaterThan(busy)
    expect(env.PUBLIC_URL).toBe(`http://127.0.0.1:${port}`)
  })

  it('leaves the environment as it is when the port is free', async () => {
    const free = await findFreePort((await occupy()) + 1)
    const env = { PORT: String(free), PUBLIC_URL: `http://localhost:${free}` }
    expect(await withFreePort(env)).toBe(env)
  })

  it('keeps a deployment on its port, and a PUBLIC_URL that names another port', async () => {
    const busy = await occupy()
    const deployed = { PORT: String(busy), PUBLIC_URL: 'https://chat.example.com' }
    expect(await withFreePort(deployed)).toBe(deployed)
    const proxied = { PORT: String(busy), PUBLIC_URL: 'http://127.0.0.1:8080' }
    expect(await withFreePort(proxied)).toBe(proxied)
  })

  it('leaves invalid values for loadConfig to report', async () => {
    const env = { PORT: '0', PUBLIC_URL: 'nope' }
    expect(await withFreePort(env)).toBe(env)
  })
})
