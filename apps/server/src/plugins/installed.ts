import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Logger, Plugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

/** The package.json keyword that marks a dependency as an SCN Chat plugin. */
export const PLUGIN_KEYWORD = 'scn-chat-plugin'

export type InstalledPlugin = {
  package: string
  description: string | null
  version: string | null
  factory: (options: unknown) => Plugin
  optionsSchema?: z.ZodType
  /** Whether admins can add the package more than once, with different options. */
  multiple: boolean
}

export type InstalledPlugins = ReadonlyMap<string, InstalledPlugin>

type PackageJson = {
  description?: string
  version?: string
  keywords?: string[]
  dependencies?: Record<string, string>
}

type PluginModule = { default?: unknown; optionsSchema?: z.ZodType; multipleInstances?: unknown }

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as PackageJson

/** Import every dependency of the root package.json that carries the plugin keyword. */
export async function findInstalledPlugins(
  rootDir: string,
  logger: Logger,
): Promise<InstalledPlugins> {
  const root = join(rootDir, 'package.json')
  const require = createRequire(root)
  const installed = new Map<string, InstalledPlugin>()
  for (const name of Object.keys(readJson(root).dependencies ?? {})) {
    const manifest = join(rootDir, 'node_modules', name, 'package.json')
    if (!existsSync(manifest)) continue
    const pkg = readJson(manifest)
    if (!pkg.keywords?.includes(PLUGIN_KEYWORD)) continue
    const module = (await import(pathToFileURL(require.resolve(name)).href)) as PluginModule
    if (typeof module.default !== 'function') {
      logger.error({ package: name }, 'plugin package has no default export factory')
      continue
    }
    installed.set(name, {
      package: name,
      description: pkg.description ?? null,
      version: pkg.version ?? null,
      factory: module.default as (options: unknown) => Plugin,
      ...(module.optionsSchema ? { optionsSchema: module.optionsSchema } : {}),
      multiple: module.multipleInstances === true,
    })
  }
  return installed
}

/** Top-level fields of a schema marked with .meta({ secret: true }). */
export function secretKeys(schema: z.ZodType | undefined): string[] {
  if (!(schema instanceof z.ZodObject)) return []
  return Object.entries(schema.shape)
    .filter(([, field]) => (field as z.ZodType).meta()?.secret === true)
    .map(([key]) => key)
}

/** The plugin's options as JSON Schema, for the admin form. */
export function optionsJsonSchema(plugin: InstalledPlugin): Record<string, unknown> {
  return plugin.optionsSchema
    ? (z.toJSONSchema(plugin.optionsSchema, { io: 'input', unrepresentable: 'any' }) as Record<
        string,
        unknown
      >)
    : { type: 'object', properties: {} }
}
