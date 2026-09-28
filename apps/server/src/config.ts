import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, YAMLParseError } from 'yaml'
import { z } from 'zod'

export class ConfigError extends Error {
  /** The settings or environment variables at fault. */
  readonly names: string[]

  constructor(names: string[], details: string) {
    super(`Invalid configuration for ${names.join(', ')}: ${details}`)
    this.name = 'ConfigError'
    this.names = names
  }
}

export const DEFAULT_DATABASE_URL = 'sqlite:./data/scn-chat.sqlite'

const key32 = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64 encoded')

const capabilities = z.object({ vision: z.boolean(), reasoning: z.boolean(), tools: z.boolean() })

const fileSchema = z
  .object({
    app: z
      .object({
        name: z.string().min(1).default('SCN Chat'),
        publicUrl: z.url().default('http://127.0.0.1:3000'),
        port: z.coerce.number().int().min(1).max(65535).default(3000),
        dataDir: z.string().min(1).default('./data'),
        logLevel: z
          .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
          .default('info'),
        /** Let the server reach PDSes and DID documents on private networks, for a local PDS. */
        allowPrivateNetworks: z.boolean().default(false),
      })
      .prefault({}),
    auth: z
      .object({
        scopeMode: z.enum(['permission-set', 'raw']).default('permission-set'),
        sessionTtlDays: z.coerce.number().int().min(1).default(30),
        plcUrl: z.url().default('https://plc.directory'),
      })
      .prefault({}),
    turns: z
      .object({
        ratePerMinute: z.coerce.number().int().min(1).default(10),
        maxSteps: z.coerce.number().int().min(1).default(8),
        timeoutSeconds: z.coerce.number().int().min(1).default(600),
        backfillMinutes: z.coerce.number().int().min(0).default(60),
      })
      .prefault({}),
    sync: z
      .object({
        safetyNet: z
          .object({
            enabled: z.boolean().optional(),
            intervalMinutes: z.number().positive().optional(),
            activeWithinHours: z.number().positive().optional(),
          })
          .optional(),
        discovery: z
          .object({
            intervalMinutes: z.number().positive().optional(),
            activeWithinDays: z.number().positive().optional(),
          })
          .optional(),
        allowUserOptOut: z.boolean().optional(),
      })
      .prefault({}),
    roles: z.record(z.string(), z.array(z.string())).default({}),
    plugins: z
      .array(
        z.object({
          package: z.string().min(1),
          options: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .default([]),
    models: z
      .array(
        z.object({
          provider: z.string().min(1),
          id: z.string().min(1),
          name: z.string().min(1),
          capabilities,
          roles: z.array(z.string()),
          default: z.boolean().optional(),
        }),
      )
      .default([]),
  })
  .strict()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default(DEFAULT_DATABASE_URL),
  SECRET_KEY: key32,
  SECRET_KEYS_OLD: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
    )
    .pipe(z.array(key32)),
  OAUTH_PRIVATE_KEYS: z
    .string()
    .default('[]')
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be a JSON array of private JWKs' })
        return z.NEVER
      }
    })
    .pipe(z.array(z.looseObject({ kid: z.string().min(1), kty: z.string(), d: z.string() }))),
})

/** Environment variables that override public settings. */
export const ENV_OVERRIDES: Record<string, [section: string, key: string]> = {
  APP_NAME: ['app', 'name'],
  PUBLIC_URL: ['app', 'publicUrl'],
  PORT: ['app', 'port'],
  DATA_DIR: ['app', 'dataDir'],
  LOG_LEVEL: ['app', 'logLevel'],
  OAUTH_SCOPE_MODE: ['auth', 'scopeMode'],
  SESSION_TTL_DAYS: ['auth', 'sessionTtlDays'],
  PLC_URL: ['auth', 'plcUrl'],
  TURN_RATE_PER_MINUTE: ['turns', 'ratePerMinute'],
  TURN_MAX_STEPS: ['turns', 'maxSteps'],
  TURN_TIMEOUT_SECONDS: ['turns', 'timeoutSeconds'],
  TURN_BACKFILL_MINUTES: ['turns', 'backfillMinutes'],
}

export type FileConfig = z.infer<typeof fileSchema>
export type ModelConfig = FileConfig['models'][number]
export type SyncConfig = FileConfig['sync']
export type PluginEntry = FileConfig['plugins'][number]

export type Config = Readonly<{
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  publicUrl: string
  appName: string
  dataDir: string
  databaseUrl: string
  logLevel: string
  allowPrivateNetworks: boolean
  secretKey: Buffer
  oldSecretKeys: Buffer[]
  oauthPrivateKeys: { kid: string; [key: string]: unknown }[]
  oauthScopeMode: 'permission-set' | 'raw'
  sessionTtlDays: number
  plcUrl: string
  turns: { ratePerMinute: number; maxSteps: number; timeoutMs: number; backfillWindowMs: number }
  configDir: string
  plugins: PluginEntry[]
  models: ModelConfig[]
  roles: Record<string, string[]>
  sync: SyncConfig
}>

const EXACT_REFERENCE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/
const REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** Replace ${NAME} references with environment values. An exact reference to a missing variable becomes unset. */
export function interpolate(value: unknown, env: Record<string, string | undefined>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(EXACT_REFERENCE)
    if (exact?.[1]) return env[exact[1]] || undefined
    return value.replace(REFERENCE, (_match, name: string) => {
      const found = env[name]
      if (!found)
        throw new ConfigError([name], `referenced in config.yml but not set in the environment`)
      return found
    })
  }
  if (Array.isArray(value))
    return value.map((item) => interpolate(item, env)).filter((item) => item !== undefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, interpolate(item, env)] as const)
        .filter(([, item]) => item !== undefined),
    )
  }
  return value
}

/** Read and parse config.yml, failing with a pointer to the example when it is missing. */
export function readConfigFile(path: string): unknown {
  if (!existsSync(path)) {
    throw new ConfigError(
      ['config.yml'],
      `no config file at ${path}. Copy config.example.yml to config.yml and edit it, or set SCN_CHAT_CONFIG.`,
    )
  }
  try {
    return parse(readFileSync(path, 'utf8')) ?? {}
  } catch (err) {
    if (err instanceof YAMLParseError)
      throw new ConfigError(['config.yml'], `${resolve(path)} is not valid YAML: ${err.message}`)
    throw err
  }
}

export const defaultConfigPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config.yml',
)

function issuesToError(issues: z.core.$ZodIssue[], prefix = ''): ConfigError {
  const names = [
    ...new Set(issues.map((issue) => `${prefix}${issue.path.join('.')}` || 'config.yml')),
  ]
  const details = issues
    .map((issue) => `${prefix}${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  return new ConfigError(names, details)
}

/** Build the config from config.yml's contents and the environment, once at startup. */
export function loadConfig(options: {
  env?: Record<string, string | undefined>
  file?: unknown
  configPath?: string
}): Config {
  const env = options.env ?? process.env
  const raw = interpolate(options.file ?? {}, env) as Record<string, Record<string, unknown>>
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ConfigError(['config.yml'], 'must be a mapping')
  for (const [variable, [section, key]] of Object.entries(ENV_OVERRIDES)) {
    const value = env[variable]
    if (value !== undefined && value !== '')
      raw[section] = { ...(raw[section] ?? {}), [key]: value }
  }
  const fileResult = fileSchema.safeParse(raw)
  const envResult = envSchema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')),
  )
  const issues = [
    ...(fileResult.success ? [] : [issuesToError(fileResult.error.issues)]),
    ...(envResult.success ? [] : [issuesToError(envResult.error.issues)]),
  ]
  if (issues.length) {
    throw new ConfigError(
      issues.flatMap((error) => error.names),
      issues
        .map((error) => error.message.replace(/^Invalid configuration for [^:]+: /, ''))
        .join('; '),
    )
  }
  const file = fileResult.data as FileConfig
  const secrets = envResult.data as z.infer<typeof envSchema>
  if (secrets.NODE_ENV === 'production') {
    const problems: [string, string][] = []
    if (!file.app.publicUrl.startsWith('https://'))
      problems.push(['app.publicUrl', 'must be HTTPS in production'])
    if (secrets.OAUTH_PRIVATE_KEYS.length === 0)
      problems.push(['OAUTH_PRIVATE_KEYS', 'is required in production'])
    if (file.auth.scopeMode === 'raw')
      problems.push(['auth.scopeMode', 'raw is for local development only'])
    if (problems.length) {
      throw new ConfigError(
        problems.map(([name]) => name),
        problems.map(([name, message]) => `${name}: ${message}`).join('; '),
      )
    }
  }
  return Object.freeze({
    nodeEnv: secrets.NODE_ENV,
    port: file.app.port,
    publicUrl: file.app.publicUrl.replace(/\/$/, ''),
    appName: file.app.name,
    dataDir: file.app.dataDir,
    databaseUrl: secrets.DATABASE_URL,
    logLevel: file.app.logLevel,
    allowPrivateNetworks: file.app.allowPrivateNetworks,
    secretKey: Buffer.from(secrets.SECRET_KEY, 'base64'),
    oldSecretKeys: secrets.SECRET_KEYS_OLD.map((key) => Buffer.from(key, 'base64')),
    oauthPrivateKeys: secrets.OAUTH_PRIVATE_KEYS,
    oauthScopeMode: file.auth.scopeMode,
    sessionTtlDays: file.auth.sessionTtlDays,
    plcUrl: file.auth.plcUrl,
    turns: {
      ratePerMinute: file.turns.ratePerMinute,
      maxSteps: file.turns.maxSteps,
      timeoutMs: file.turns.timeoutSeconds * 1000,
      backfillWindowMs: file.turns.backfillMinutes * 60_000,
    },
    configDir: dirname(options.configPath ?? defaultConfigPath),
    plugins: file.plugins,
    models: file.models,
    roles: file.roles,
    sync: file.sync,
  })
}
