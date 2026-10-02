import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Web, WebContext } from './app.ts'

const webRoot = fileURLToPath(new URL('../../web', import.meta.url))

/** Start's server entry: a fetch handler that renders pages, given each request's context. */
type StartEntry = {
  fetch: (request: Request, options: { context: WebContext }) => Promise<Response>
}

/** Start's built handler and client assets, from the web app's `vite build`. */
export async function loadBuiltWeb(): Promise<Web> {
  const entry = pathToFileURL(join(webRoot, 'dist/server/server.js')).href
  const start = (await import(entry)).default as StartEntry
  return {
    assets: join(webRoot, 'dist/client'),
    fetch: (request, context) => start.fetch(request, { context }),
  }
}

export type DevWeb = {
  web: Web
  /** Vite's middlewares, which serve modules and HMR and call `next` for everything else. */
  middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => void
  close: () => Promise<void>
}

/** Start's virtual server entry, which Start's own dev middleware imports the same way. */
const START_SERVER_ENTRY = 'virtual:tanstack-start-server-entry'

/**
 * Vite in middleware mode on the server's HTTP server. Start's entry runs through Vite's SSR
 * runner on each request, so web edits apply without a restart and the server never enters
 * Vite's module graph. Importing the entry ourselves, rather than letting Start install its dev
 * middleware, is what lets each request carry its context.
 */
export async function loadDevWeb(http: Server): Promise<DevWeb> {
  const { createServer, isRunnableDevEnvironment } = await import('vite')
  const vite = await createServer({
    root: webRoot,
    // The default loader imports a temporary bundle of the config, which restarts `node --watch`.
    configLoader: 'runner',
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server: http } },
  })
  const ssr = vite.environments.ssr
  if (!ssr || !isRunnableDevEnvironment(ssr))
    throw new Error('The web app has no runnable SSR environment')
  return {
    web: {
      async fetch(request, context) {
        try {
          const start = (await ssr.runner.import(START_SERVER_ENTRY)).default as StartEntry
          return await start.fetch(request, { context })
        } catch (err) {
          if (err instanceof Error) vite.ssrFixStacktrace(err)
          throw err
        }
      },
    },
    middleware: vite.middlewares,
    close: () => vite.close(),
  }
}
