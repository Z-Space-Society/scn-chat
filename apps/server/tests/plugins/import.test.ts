import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadConfig } from '../../src/config.ts'
import { importPlugins } from '../../src/plugins/import.ts'

const fixtures = fileURLToPath(new URL('../fixtures/plugins', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))

describe('importPlugins', () => {
  it('loads a local plugin by path, validating and defaulting its options', async () => {
    const plugins = await importPlugins(
      [{ package: './good' }, { package: './good', options: { greeting: 'hi' } }],
      fixtures,
    )
    expect(plugins.map((plugin) => plugin.id)).toEqual(['good-hello', 'good-hi'])
  })

  it('stops with an error naming the package and option when options fail the schema', async () => {
    await expect(
      importPlugins([{ package: './good', options: { count: 'many' } }], fixtures),
    ).rejects.toThrow(/"\.\/good".*count/)
    await expect(
      importPlugins([{ package: './good', options: { typo: true } }], fixtures),
    ).rejects.toThrow(/"\.\/good"/)
  })

  it('stops with an error naming a package that cannot be found, and why', async () => {
    await expect(importPlugins([{ package: '@scn-chat/plugin-nope' }], fixtures)).rejects.toThrow(
      /Cannot load plugin package "@scn-chat\/plugin-nope".*Cannot find/,
    )
  })

  it('reports a broken package.json in a local plugin as a parse error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scn-plugin-'))
    writeFileSync(join(dir, 'package.json'), '{ not json')
    await expect(importPlugins([{ package: dir }], fixtures)).rejects.toThrow(/JSON/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('stops when a package has no factory', async () => {
    await expect(importPlugins([{ package: './noexport' }], fixtures)).rejects.toThrow(
      /no default export factory/,
    )
  })

  it('resolves npm packages from the config directory', async () => {
    const [plugin] = await importPlugins([{ package: '@scn-chat/plugin-titles' }], repoRoot)
    expect(plugin?.id).toBe('titles')
  })
})

describe('config.example.yml', () => {
  it('loads with every shipped plugin, with no secrets set', async () => {
    const file = parse(readFileSync(`${repoRoot}/config.example.yml`, 'utf8'))
    const config = loadConfig({
      env: { SECRET_KEY: Buffer.alloc(32, 1).toString('base64') },
      file,
      configPath: `${repoRoot}/config.example.yml`,
    })
    const plugins = await importPlugins(config.plugins, config.configDir)
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      'openai-compatible-scn',
      'openai-compatible-cocore',
      'anthropic',
      'openai',
      'google',
      'openai-compatible-custom',
      'pdf-text',
      'titles',
      'web-search',
      'web-fetch',
    ])
  })
})
