import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  DEFAULT_SYSTEM_PROMPT,
  interpolate,
  loadConfig,
  readConfigFile,
} from '../src/config.ts'

const SECRET_KEY = Buffer.alloc(32, 1).toString('base64')
const env = { SECRET_KEY }

describe('loadConfig', () => {
  it('returns typed defaults when config.yml sets nothing', () => {
    const config = loadConfig({ env, file: {} })
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      appName: 'SCN Chat',
      oauthScopeMode: 'permission-set',
    })
    expect(config.turns).toEqual({
      ratePerMinute: 10,
      maxSteps: 8,
      timeoutMs: 600_000,
      backfillWindowMs: 3_600_000,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
    })
  })

  it('reads public settings from config.yml', () => {
    const config = loadConfig({
      env,
      file: {
        app: { name: 'My Chat', publicUrl: 'https://chat.example.com/', port: 8080 },
        turns: { maxSteps: 3 },
        roles: { staff: ['did:plc:a'] },
      },
    })
    expect(config).toMatchObject({
      appName: 'My Chat',
      publicUrl: 'https://chat.example.com',
      port: 8080,
      roles: { staff: ['did:plc:a'] },
    })
    expect(config.turns.maxSteps).toBe(3)
  })

  it('lets environment variables override public settings', () => {
    const config = loadConfig({
      env: { ...env, PORT: '9000', OAUTH_SCOPE_MODE: 'raw', TURN_MAX_STEPS: '2' },
      file: { app: { port: 8080 } },
    })
    expect(config).toMatchObject({ port: 9000, oauthScopeMode: 'raw' })
    expect(config.turns.maxSteps).toBe(2)
  })

  it('fails naming the setting when a value in config.yml is invalid', () => {
    expect(() => loadConfig({ env, file: { app: { port: 'not-a-port' } } })).toThrow(/app\.port/)
  })

  it('refuses unknown top-level sections', () => {
    expect(() => loadConfig({ env, file: { aap: {} } })).toThrow(ConfigError)
  })

  it('reports every invalid setting and secret at once', () => {
    try {
      loadConfig({ env: {}, file: { app: { port: 0, publicUrl: 'nope' } } })
      expect.unreachable()
    } catch (err) {
      expect((err as ConfigError).names.sort()).toEqual(['SECRET_KEY', 'app.port', 'app.publicUrl'])
    }
  })

  it('fails naming SECRET_KEY when it is not 32 bytes', () => {
    expect(() =>
      loadConfig({ env: { SECRET_KEY: Buffer.alloc(16).toString('base64') }, file: {} }),
    ).toThrow(/SECRET_KEY/)
  })

  it('parses retired keys from a comma-separated list', () => {
    const old = Buffer.alloc(32, 2).toString('base64')
    expect(
      loadConfig({ env: { ...env, SECRET_KEYS_OLD: `${old}, ${old}` }, file: {} }).oldSecretKeys,
    ).toHaveLength(2)
  })

  it('treats empty values in .env as unset', () => {
    const config = loadConfig({
      env: { ...env, OAUTH_PRIVATE_KEYS: '', SECRET_KEYS_OLD: '', DATABASE_URL: '' },
      file: {},
    })
    expect(config).toMatchObject({
      oauthPrivateKeys: [],
      oldSecretKeys: [],
      databaseUrl: 'sqlite:./data/scn-chat.sqlite',
    })
  })

  it('fails naming OAUTH_PRIVATE_KEYS when it is not a JSON array of keys', () => {
    expect(() => loadConfig({ env: { ...env, OAUTH_PRIVATE_KEYS: 'not json' }, file: {} })).toThrow(
      /OAUTH_PRIVATE_KEYS/,
    )
  })

  it('refuses an HTTP public URL, missing keys, and raw scopes in production', () => {
    try {
      loadConfig({
        env: { ...env, NODE_ENV: 'production' },
        file: { app: { publicUrl: 'http://chat.example.com' }, auth: { scopeMode: 'raw' } },
      })
      expect.unreachable()
    } catch (err) {
      expect((err as ConfigError).names.sort()).toEqual([
        'OAUTH_PRIVATE_KEYS',
        'app.publicUrl',
        'auth.scopeMode',
      ])
    }
  })

  it('returns a frozen object with the config directory for resolving plugins', () => {
    const config = loadConfig({ env, file: {}, configPath: '/srv/scn/config.yml' })
    expect(Object.isFrozen(config)).toBe(true)
    expect(config.configDir).toBe('/srv/scn')
  })
})

describe('interpolate', () => {
  it('replaces references with environment values', () => {
    expect(interpolate({ a: '${KEY}', b: 'Bearer ${KEY}' }, { KEY: 'sk-1' })).toEqual({
      a: 'sk-1',
      b: 'Bearer sk-1',
    })
  })

  it('leaves out a value that is exactly a reference to a missing variable', () => {
    expect(interpolate({ options: { apiKey: '${MISSING}', name: 'x' } }, {})).toEqual({
      options: { name: 'x' },
    })
  })

  it('fails naming the variable when a longer string references a missing one', () => {
    expect(() => interpolate({ url: 'https://${HOST}/v1' }, {})).toThrow(/HOST/)
  })

  it('reaches plugin options inside lists', () => {
    const file = { plugins: [{ package: 'p', options: { apiKey: '${KEY}' } }] }
    expect(interpolate(file, { KEY: 'k' })).toEqual({
      plugins: [{ package: 'p', options: { apiKey: 'k' } }],
    })
  })
})

describe('readConfigFile', () => {
  it('fails with a message naming config.example.yml when the file is missing', () => {
    expect(() => readConfigFile('/nonexistent/config.yml')).toThrow(/config\.example\.yml/)
  })

  it('reports invalid YAML as a config error with its line', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'scn-config-')), 'config.yml')
    writeFileSync(path, 'models: []\n  - provider: x\n')
    expect(() => readConfigFile(path)).toThrow(ConfigError)
    expect(() => readConfigFile(path)).toThrow(/not valid YAML.*line 2/s)
  })
})
