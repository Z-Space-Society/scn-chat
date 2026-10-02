import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { loadConfig } from './config.ts'
import { createDb } from './db/index.ts'
import { createLogger } from './logger.ts'
import { findInstalledPlugins } from './plugins/installed.ts'
import { createServer } from './server.ts'

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
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))

const server = await createServer({
  config,
  db,
  logger,
  installed,
  webDist: config.nodeEnv === 'production' ? webDist : undefined,
})

const http = serve({ fetch: server.app.fetch, port: config.port }, ({ port }) => {
  logger.info(
    { port, publicUrl: config.publicUrl },
    `${server.settings.get('general').appName} server listening`,
  )
})

const shutdown = async () => {
  logger.info('shutting down')
  http.close()
  await server.close()
  await db.destroy()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
