import { existsSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { defaultConfigPath, loadConfig, readConfigFile } from './config.ts'
import { createDb } from './db/index.ts'
import { createLogger } from './logger.ts'
import { importPlugins } from './plugins/import.ts'
import { createServer } from './server.ts'
import { loadBuiltWeb, loadDevWeb } from './web.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
else if (existsSync('../../.env')) process.loadEnvFile('../../.env')

const configPath = process.env.SCN_CHAT_CONFIG || defaultConfigPath
const config = loadConfig({ env: process.env, file: readConfigFile(configPath), configPath })
const logger = createLogger(config.logLevel)
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'))
const db = createDb(config.databaseUrl)
const plugins = await importPlugins(config.plugins, config.configDir)

// In development Vite serves the web app from source, sharing this HTTP server for HMR.
const http = createHttpServer()
const dev = config.nodeEnv === 'production' ? undefined : await loadDevWeb(http)

const server = await createServer({
  config,
  appConfig: { plugins, models: config.models, roles: config.roles, sync: config.sync },
  db,
  logger,
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
    `${config.appName} server listening`,
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
