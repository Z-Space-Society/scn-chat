import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { defaultConfigPath, loadConfig, readConfigFile } from './config.ts'
import { createDb } from './db/index.ts'
import { createLogger } from './logger.ts'
import { importPlugins } from './plugins/import.ts'
import { createServer } from './server.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
else if (existsSync('../../.env')) process.loadEnvFile('../../.env')

const configPath = process.env.SCN_CHAT_CONFIG || defaultConfigPath
const config = loadConfig({ env: process.env, file: readConfigFile(configPath), configPath })
const logger = createLogger(config.logLevel)
const db = createDb(config.databaseUrl)
const plugins = await importPlugins(config.plugins, config.configDir)
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))

const server = await createServer({
  config,
  appConfig: { plugins, models: config.models, roles: config.roles, sync: config.sync },
  db,
  logger,
  webDist: config.nodeEnv === 'production' ? webDist : undefined,
})

const http = serve({ fetch: server.app.fetch, port: config.port }, ({ port }) => {
  logger.info({ port, publicUrl: config.publicUrl }, `${config.appName} server listening`)
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
