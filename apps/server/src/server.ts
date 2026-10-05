import { createApp, type Web } from './app.ts'
import { Access } from './auth/access.ts'
import { type Account, getAccount } from './auth/accounts.ts'
import { createIdentityResolver, type IdentityResolver } from './auth/identity.ts'
import { createOAuthClient, type OAuthClientLike } from './auth/oauth-client.ts'
import { createPdsClientFactory } from './auth/pds.ts'
import { Roles } from './auth/roles.ts'
import { buildScope } from './auth/scope.ts'
import { sweepExpired } from './auth/web-session.ts'
import { turnBlobs } from './blobs/routes.ts'
import { createBlobStores } from './blobs/store.ts'
import type { Config } from './config.ts'
import type { Db } from './db/index.ts'
import { migrateToLatest } from './db/migrate.ts'
import type { Logger } from './logger.ts'
import { PluginAdmin } from './plugins/admin.ts'
import type { PluginServices } from './plugins/host.ts'
import type { InstalledPlugins } from './plugins/installed.ts'
import { readInstances } from './plugins/instances.ts'
import { RuntimeHolder, runtimeBuilder } from './plugins/runtime.ts'
import { readUserSettings } from './plugins/user-settings.ts'
import { ModelCatalog } from './providers/catalog.ts'
import { createGenerateText } from './providers/generate-text.ts'
import { createGuardedFetch } from './providers/guarded-fetch.ts'
import { SecretBox } from './secrets.ts'
import { SettingsStore } from './settings/store.ts'
import { SharingService } from './sharing/service.ts'
import { parseSpaceUri } from './storage/records.ts'
import { createChatServices } from './storage/services.ts'
import { CredentialCache, mintSpaceCredential } from './sync/credentials.ts'
import { SyncEngine } from './sync/engine.ts'
import { SyncEventBus } from './sync/events.ts'
import { RecentWrites } from './sync/recent-writes.ts'
import { startSyncScheduler } from './sync/scheduler.ts'
import { TurnRunner } from './turns/runner.ts'
import { StreamHub } from './turns/stream-hub.ts'

export type ServerDeps = {
  config: Config
  db: Db
  logger: Logger
  /** The plugin packages admins can add. */
  installed: InstalledPlugins
  web?: Web
  /** Replacements for network-facing pieces, for tests. */
  oauth?: OAuthClientLike
  identity?: IdentityResolver
  startBackgroundJobs?: boolean
}

/** Build every service and the HTTP app from the environment and the stored settings. */
export async function createServer(deps: ServerDeps) {
  const { config, db, logger } = deps
  await migrateToLatest(db)
  const settings = await SettingsStore.load(db, logger)
  const appName = () => settings.get('general').appName
  const box = new SecretBox(config.secretKey, config.oldSecretKeys)
  const scope = buildScope(config.oauthScopeMode)
  const oauth = deps.oauth ?? (await createOAuthClient(config, db, scope, appName()))
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

  // Set once the plugins load, which needs the services below.
  let holder: RuntimeHolder | undefined
  const runtime = () => {
    if (!holder) throw new Error('Plugins are not ready yet')
    return holder.current()
  }
  const roles = new Roles({
    db,
    adminDids: new Set(config.adminDids),
    sources: () => (holder ? holder.current().host.roleSources.list() : []),
    logger,
  })
  const access = new Access({ db, roles, settings, logger })
  const hasAccess = (did: string) => access.hasAccess(did)

  const accountFor = async (did: string): Promise<Account> => {
    const account = await getAccount(db, did)
    if (!account) throw new Error(`No account for ${did}`)
    return account
  }
  const pluginServices: PluginServices = {
    generateText: (request) => createGenerateText(runtime().catalog, logger)(request),
    updateInfo: async (user, conversation, patch, options) => {
      const chats = services.forAccount(await accountFor(user))
      await chats.updateInfo(parseSpaceUri(conversation).skey, patch, options)
    },
    userSettings: (plugin, user) => readUserSettings(db, box, user, plugin),
    suspendAccount: (did, by, reason) => access.suspend(did, by, reason),
    restoreAccount: (did, by) => access.restore(did, by),
  }
  const load = {
    services: pluginServices,
    logger,
    app: Object.freeze({
      get name() {
        return appName()
      },
      publicUrl: config.publicUrl,
    }),
  }
  const build = runtimeBuilder({
    installed: deps.installed,
    load,
    catalog: (host) =>
      new ModelCatalog({
        db,
        box,
        providers: host.providers,
        rolesOf: (did) => access.rolesForDid(did),
        guardedFetch,
        logger,
      }),
    logger,
  })
  const initial = await build(await readInstances(db, box))
  for (const [instance, status] of initial.statuses) {
    if (status.state === 'failed')
      logger.error({ instance, error: status.error }, 'a plugin failed to load at startup')
  }
  holder = new RuntimeHolder(initial, logger)
  const plugins = new PluginAdmin({
    db,
    box,
    installed: deps.installed,
    holder,
    build,
    load,
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
    backfillWindowMs: () => settings.get('turns').backfillMinutes * 60_000,
    hasAccess,
  })
  const hub = new StreamHub()
  const blobsFor = blobStores.forAccount
  const runner = new TurnRunner({
    db,
    services,
    plugins: holder,
    hub,
    blobs: turnBlobs(blobsFor, services),
    settings: () => {
      const turns = settings.get('turns')
      return {
        ratePerMinute: turns.ratePerMinute,
        maxSteps: turns.maxSteps,
        timeoutMs: turns.timeoutSeconds * 1000,
        backfillWindowMs: turns.backfillMinutes * 60_000,
        systemPrompt: turns.systemPrompt,
      }
    },
    appName,
    hasAccess,
    rolesOf: (did) => access.rolesForDid(did),
    toolFetch: serviceFetch,
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
    settings,
    web: deps.web,
    auth: { config, db, logger, oauth, identity, roles, access, settings, scope, onLogin },
    plugins: { db, box, host: () => runtime().host },
    storage: {
      db,
      services,
      events,
      engine,
      hooks: () => runtime().host.hooks,
      sync: () => settings.get('sync'),
      logger,
    },
    providers: {
      db,
      box,
      catalog: () => runtime().catalog,
      providers: () => runtime().host.providers,
      guardedFetch,
      logger,
    },
    turns: { services, runner, hub },
    blobs: { blobsFor, services, ingesters: () => runtime().host.ingesters, logger },
    sharing,
    sync: {
      db,
      engine,
      events,
      publicUrl: config.publicUrl,
      resolveSigningKey: identity.resolveSigningKey,
      logger,
    },
    admin: { db, roles, access, settings, identity, plugins, runtime, logger },
  })

  const stops: (() => void)[] = []
  if (deps.startBackgroundJobs !== false) {
    await runner.recover()
    stops.push(
      startSyncScheduler({
        engine,
        db,
        sync: () => settings.get('sync'),
        onSyncChange: (listener) => settings.subscribe('sync', listener),
        hasAccess,
        logger,
      }),
    )
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
    settings,
    holder,
    async close() {
      for (const stop of stops) stop()
      await runner.idle()
      await holder?.close()
    },
  }
}
