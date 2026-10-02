import { isValidDid } from '@atproto/syntax'
import { z } from 'zod'

export class ConfigError extends Error {
  /** The environment variables at fault. */
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

const list = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )

const flag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default(DEFAULT_DATABASE_URL),
  SECRET_KEY: key32,
  SECRET_KEYS_OLD: list.pipe(z.array(key32)),
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
  ADMIN_DIDS: list.pipe(
    z
      .array(z.string())
      .min(1, 'must list at least one admin DID')
      .superRefine((dids, ctx) => {
        for (const did of dids) {
          if (!isValidDid(did))
            ctx.addIssue({ code: 'custom', message: `holds an invalid DID: "${did}"` })
        }
      }),
  ),
  PUBLIC_URL: z.url().default('http://127.0.0.1:3000'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1).default('./data'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Let the server reach PDSes and DID documents on private networks, for a local PDS. */
  ALLOW_PRIVATE_NETWORKS: flag,
  OAUTH_SCOPE_MODE: z.enum(['permission-set', 'raw']).default('permission-set'),
  PLC_URL: z.url().default('https://plc.directory'),
})

export type Config = Readonly<{
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  publicUrl: string
  dataDir: string
  databaseUrl: string
  logLevel: string
  allowPrivateNetworks: boolean
  secretKey: Buffer
  oldSecretKeys: Buffer[]
  oauthPrivateKeys: { kid: string; [key: string]: unknown }[]
  oauthScopeMode: 'permission-set' | 'raw'
  plcUrl: string
  adminDids: readonly string[]
}>

/** Build the config from the environment, once at startup. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')),
  )
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))]
    const details = result.error.issues
      .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
      .join('; ')
    throw new ConfigError(names, details)
  }
  const values = result.data
  if (values.NODE_ENV === 'production') {
    const problems: [string, string][] = []
    if (!values.PUBLIC_URL.startsWith('https://'))
      problems.push(['PUBLIC_URL', 'must be HTTPS in production'])
    if (values.OAUTH_PRIVATE_KEYS.length === 0)
      problems.push(['OAUTH_PRIVATE_KEYS', 'is required in production'])
    if (values.OAUTH_SCOPE_MODE === 'raw')
      problems.push(['OAUTH_SCOPE_MODE', 'raw is for local development only'])
    if (problems.length) {
      throw new ConfigError(
        problems.map(([name]) => name),
        problems.map(([name, message]) => `${name}: ${message}`).join('; '),
      )
    }
  }
  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    publicUrl: values.PUBLIC_URL.replace(/\/$/, ''),
    dataDir: values.DATA_DIR,
    databaseUrl: values.DATABASE_URL,
    logLevel: values.LOG_LEVEL,
    allowPrivateNetworks: values.ALLOW_PRIVATE_NETWORKS,
    secretKey: Buffer.from(values.SECRET_KEY, 'base64'),
    oldSecretKeys: values.SECRET_KEYS_OLD.map((key) => Buffer.from(key, 'base64')),
    oauthPrivateKeys: values.OAUTH_PRIVATE_KEYS,
    oauthScopeMode: values.OAUTH_SCOPE_MODE,
    plcUrl: values.PLC_URL,
    adminDids: Object.freeze([...values.ADMIN_DIDS]),
  })
}
