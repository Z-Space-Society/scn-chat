import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { findInstalledPlugins, optionsJsonSchema, secretKeys } from '../../src/plugins/installed.ts'

const fixtures = fileURLToPath(new URL('../fixtures/plugins', import.meta.url))
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A project root whose package.json depends on the named fixture packages, linked into node_modules. */
function root(links: Record<string, string>, extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'scn-root-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'node_modules'))
  for (const [name, fixture] of Object.entries(links))
    symlinkSync(join(fixtures, fixture), join(dir, 'node_modules', name), 'dir')
  for (const [name, contents] of Object.entries(extra)) {
    mkdirSync(join(dir, 'node_modules', name))
    writeFileSync(join(dir, 'node_modules', name, 'package.json'), contents)
  }
  const dependencies = Object.fromEntries(
    [...Object.keys(links), ...Object.keys(extra)].map((name) => [name, '*']),
  )
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies }))
  return dir
}

function logged() {
  const lines: Record<string, unknown>[] = []
  const logger = pino({ level: 'info' }, { write: (line: string) => lines.push(JSON.parse(line)) })
  return { logger, lines }
}

describe('findInstalledPlugins', () => {
  it('lists dependencies with the plugin keyword, with their description, version, and schema', async () => {
    const dir = root(
      { 'good-plugin': 'good' },
      { 'not-a-plugin': JSON.stringify({ name: 'not-a-plugin', version: '1.0.0' }) },
    )
    const installed = await findInstalledPlugins(dir, logged().logger)
    expect([...installed.keys()]).toEqual(['good-plugin'])
    const good = installed.get('good-plugin')
    expect(good).toMatchObject({ description: 'The good test plugin', version: '1.0.0' })
    expect(good?.factory({ greeting: 'hi' }).id).toBe('good-hi')
    expect(optionsJsonSchema(good as never)).toMatchObject({
      properties: { greeting: { type: 'string', default: 'hello' } },
    })
  })

  it('leaves out and logs a keyworded package without a factory', async () => {
    const { logger, lines } = logged()
    const installed = await findInstalledPlugins(root({ 'noexport-plugin': 'noexport' }), logger)
    expect(installed.size).toBe(0)
    expect(lines).toContainEqual(expect.objectContaining({ package: 'noexport-plugin' }))
  })

  it('finds the plugins this repository ships, and which can be added more than once', async () => {
    const repo = fileURLToPath(new URL('../../../..', import.meta.url))
    const installed = await findInstalledPlugins(repo, logged().logger)
    expect(installed.get('@scn-chat/plugin-web-search')?.multiple).toBe(false)
    expect(installed.get('@scn-chat/plugin-openai-compatible')?.multiple).toBe(true)
  })

  it('marks every shipped plugin API key option secret, so it is stored encrypted and never returned', async () => {
    const repo = fileURLToPath(new URL('../../../..', import.meta.url))
    const installed = await findInstalledPlugins(repo, logged().logger)
    const keyed = [...installed.values()].filter((plugin) =>
      Object.keys(optionsJsonSchema(plugin).properties ?? {}).includes('apiKey'),
    )
    expect(keyed.length).toBeGreaterThan(0)
    for (const plugin of keyed) expect(secretKeys(plugin.optionsSchema)).toContain('apiKey')
  })
})

describe('secretKeys', () => {
  it('names the top-level fields marked secret', () => {
    const schema = z.object({ apiKey: z.string().meta({ secret: true }), name: z.string() })
    expect(secretKeys(schema)).toEqual(['apiKey'])
    expect(secretKeys(undefined)).toEqual([])
  })
})
