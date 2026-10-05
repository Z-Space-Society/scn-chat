import { existsSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { getRequestListener } from '@hono/node-server'
import { loadConfig } from './config.ts'
import { createDb } from './db/index.ts'
import { createLogger } from './logger.ts'
import { findInstalledPlugins } from './plugins/installed.ts'
import { createServer } from './server.ts'
import { loadBuiltWeb, loadDevWeb } from './web.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
else if (existsSync('../../.env')) process.loadEnvFile('../../.env')

const config = loadConfig(process.env)
const logger = createLogger(config.logLevel)
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'))
const db = createDb(config.databaseUrl)
const installed = await findInstalledPlugins(
  fileURLToPath(new URL('../../..', import.meta.url)),
  logger,
)

// In development Vite serves the web app from source, sharing this HTTP server for HMR.
const http = createHttpServer()
const dev = config.nodeEnv === 'production' ? undefined : await loadDevWeb(http)

const server = await createServer({
  config,
  db,
  logger,
  installed,
  web: dev ? dev.web : await loadBuiltWeb(),
})

const listener = getRequestListener(server.app.fetch)
http.on(
  'request',
  dev ? (req, res) => dev.middleware(req, res, () => listener(req, res)) : listener,
)
http.listen(config.port, () => {
  logger.info(
    { port: config.port, publicUrl: config.publicUrl },
    `${server.settings.get('general').appName} server listening`,
  )
})

const shutdown = async () => {
  logger.info('shutting down')
  http.close()
  await dev?.close()
  await server.close()
  await db.destroy()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
