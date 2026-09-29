import type { Plugin } from '@scn-chat/plugin-api'
import { createApp } from './app.ts'
import { type Account, getAccount } from './auth/accounts.ts'
import { createIdentityResolver, type IdentityResolver } from './auth/identity.ts'
import { createOAuthClient, type OAuthClientLike } from './auth/oauth-client.ts'
import { createPdsClientFactory } from './auth/pds.ts'
import { createRoles } from './auth/roles.ts'
import { buildScope } from './auth/scope.ts'
import { sweepExpired } from './auth/web-session.ts'
import { turnBlobs } from './blobs/routes.ts'
import { createBlobStores } from './blobs/store.ts'
import type { Config, ModelConfig, SyncConfig } from './config.ts'
import type { Db } from './db/index.ts'
import { migrateToLatest } from './db/migrate.ts'
import type { Logger } from './logger.ts'
import { loadPlugins, type PluginServices } from './plugins/host.ts'
import { readUserSettings } from './plugins/user-settings.ts'
import { ModelCatalog, validateAdminModels } from './providers/catalog.ts'
import { createGenerateText } from './providers/generate-text.ts'
import { createGuardedFetch } from './providers/guarded-fetch.ts'
import { SecretBox } from './secrets.ts'
import { SharingService } from './sharing/service.ts'
import { parseSpaceUri } from './storage/records.ts'
import { createChatServices } from './storage/services.ts'
import { CredentialCache, mintSpaceCredential } from './sync/credentials.ts'
import { SyncEngine } from './sync/engine.ts'
import { SyncEventBus } from './sync/events.ts'
import { RecentWrites } from './sync/recent-writes.ts'
import { resolveSyncConfig, startSyncScheduler } from './sync/scheduler.ts'
import { TurnRunner } from './turns/runner.ts'
import { StreamHub } from './turns/stream-hub.ts'

export type AppConfig = {
  plugins: Plugin[]
  models?: ModelConfig[]
  roles?: Record<string, string[]>
  sync?: SyncConfig
}

export type ServerDeps = {
  config: Config
  appConfig: AppConfig
  db: Db
  logger: Logger
  webDist?: string
  /** Replacements for network-facing pieces, for tests. */
  oauth?: OAuthClientLike
  identity?: IdentityResolver
  startBackgroundJobs?: boolean
}

/** Build every service and the HTTP app from config. */
export async function createServer(deps: ServerDeps) {
  const { config, appConfig, db, logger } = deps
  await migrateToLatest(db)
  const roles = createRoles(appConfig.roles)
  const box = new SecretBox(config.secretKey, config.oldSecretKeys)
  const scope = buildScope(config.oauthScopeMode)
  const oauth = deps.oauth ?? (await createOAuthClient(config, db, scope))
  const getPdsClient = createPdsClientFactory(oauth)
  const identity =
    deps.identity ??
    createIdentityResolver(config.plcUrl, { allowPrivateNetworks: config.allowPrivateNetworks })
  const resolvePds = async (did: string) => (await identity.resolve(did)).pdsUrl
  const events = new SyncEventBus()
  const recentWrites = new RecentWrites()
  const services = createChatServices({ db, getPdsClient, logger, events, recentWrites })
  const blobStores = createBlobStores({ getPdsClient, dataDir: config.dataDir, db })
  const guardedFetch = createGuardedFetch()

  const accountFor = async (did: string): Promise<Account> => {
    const account = await getAccount(db, did)
    if (!account) throw new Error(`No account for ${did}`)
    return account
  }
  let catalog: ModelCatalog | undefined
  const pluginServices: PluginServices = {
    generateText: (request) => {
      if (!catalog) throw new Error('Models are not ready yet')
      return createGenerateText(catalog, logger)(request)
    },
    updateInfo: async (user, conversation, patch, options) => {
      const chats = services.forAccount(await accountFor(user))
      await chats.updateInfo(parseSpaceUri(conversation).skey, patch, options)
    },
    userSettings: (plugin, user) => readUserSettings(db, box, user, plugin),
  }
  const host = await loadPlugins(appConfig.plugins, {
    services: pluginServices,
    logger,
    app: { name: config.appName, publicUrl: config.publicUrl },
  })
  catalog = new ModelCatalog({
    db,
    box,
    providers: host.providers,
    adminModels: validateAdminModels(appConfig.models ?? [], host.providers, roles),
    roles,
    guardedFetch,
    logger,
  })

  const serviceFetch = config.allowPrivateNetworks ? fetch : guardedFetch
  const credentials = new CredentialCache({ getPdsClient, resolvePds, fetch: serviceFetch })
  const engine = new SyncEngine({
    db,
    services,
    events,
    recentWrites,
    credentials,
    resolveSigningKey: (did) => identity.resolveSigningKey(did),
    publicUrl: config.publicUrl,
    logger,
    backfillWindowMs: config.turns.backfillWindowMs,
  })
  const syncConfig = resolveSyncConfig(appConfig.sync)
  const hub = new StreamHub()
  const blobsFor = blobStores.forAccount
  const runner = new TurnRunner({
    db,
    services,
    catalog,
    host,
    hub,
    blobs: turnBlobs(blobsFor, services),
    config: config.turns,
    appName: config.appName,
    logger,
  })
  runner.attach(events)
  const sharing = new SharingService({
    getPdsClient,
    identity,
    mintCredential: (viewer, space) =>
      mintSpaceCredential({ getPdsClient, resolvePds, fetch: serviceFetch }, viewer, space),
    logger,
  })

  const onLogin = async (account: Account) => {
    await services.forAccount(account).ensureSettingsSpace()
    if (account.storageMode !== 'space') return
    const did = account.did
    // Each step runs even if an earlier one fails.
    const background = async () => {
      for (const [step, run] of [
        ['register', () => engine.registerIndex(did)],
        ['discover', () => engine.discover(did)],
        ['sync', () => engine.syncIndex(did)],
      ] as const) {
        await run().catch((err) => logger.warn({ err, did, step }, 'post-login sync failed'))
      }
    }
    void background()
  }

  const app = createApp({
    config,
    db,
    logger,
    webDist: deps.webDist,
    auth: { config, db, logger, oauth, identity, roles, scope, onLogin },
    plugins: { db, box, host },
    storage: { db, services, events, engine, hooks: host.hooks, syncConfig, logger },
    providers: { db, box, catalog, providers: host.providers, guardedFetch, logger },
    turns: { services, runner, hub },
    blobs: { blobsFor, services, ingesters: host.ingesters, logger },
    sharing,
    sync: {
      db,
      engine,
      events,
      publicUrl: config.publicUrl,
      resolveSigningKey: identity.resolveSigningKey,
      logger,
    },
  })

  const stops: (() => void)[] = []
  if (deps.startBackgroundJobs !== false) {
    await runner.recover()
    stops.push(startSyncScheduler({ engine, db, config: syncConfig, logger }))
    const sweepAll = () => {
      blobStores.local.sweep().catch((err) => logger.warn({ err }, 'blob sweep failed'))
      sweepExpired(db).catch((err) => logger.warn({ err }, 'session sweep failed'))
    }
    sweepAll()
    const sweep = setInterval(sweepAll, 86_400_000)
    stops.push(() => clearInterval(sweep))
  }

  return {
    app,
    runner,
    engine,
    async close() {
      for (const stop of stops) stop()
      await runner.idle()
      await host.close()
    },
  }
}
