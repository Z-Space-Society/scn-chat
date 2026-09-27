import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from '@scn-chat/plugin-api'
import type { z } from 'zod'
import type { PluginEntry } from '../config.ts'
import { PluginLoadError } from './host.ts'

type PluginModule = { default?: unknown; optionsSchema?: z.ZodType }

type PackageJson = { main?: string; exports?: string | Record<string, unknown> }

/** A local plugin directory's entry file, from its package.json exports or main. */
function localEntry(dir: string): string | undefined {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) return undefined
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson
  const root = typeof pkg.exports === 'object' ? pkg.exports['.'] : pkg.exports
  const target =
    typeof root === 'string'
      ? root
      : ((root as Record<string, string> | undefined)?.import ??
        (root as Record<string, string> | undefined)?.default)
  const entry = target ?? pkg.main ?? 'index.js'
  return join(dir, entry)
}

function resolvePackage(specifier: string, configDir: string): string {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const path = resolve(configDir, specifier)
    if (existsSync(path) && statSync(path).isDirectory()) {
      const entry = localEntry(path)
      if (entry && existsSync(entry)) return entry
    } else if (existsSync(path)) return path
    throw new Error(`not found at ${path}`)
  }
  return createRequire(join(configDir, 'config.yml')).resolve(specifier)
}

/** Import each configured plugin package, validate its options, and call its factory, in config order. */
export async function importPlugins(entries: PluginEntry[], configDir: string): Promise<Plugin[]> {
  const plugins: Plugin[] = []
  for (const entry of entries) {
    let resolved: string
    try {
      resolved = resolvePackage(entry.package, configDir)
    } catch (err) {
      throw new PluginLoadError(
        `Cannot load plugin package "${entry.package}" from ${configDir}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      )
    }
    const module = (await import(pathToFileURL(resolved).href)) as PluginModule
    if (typeof module.default !== 'function') {
      throw new PluginLoadError(`Plugin package "${entry.package}" has no default export factory`)
    }
    let options: unknown = entry.options ?? {}
    if (module.optionsSchema) {
      const result = module.optionsSchema.safeParse(options)
      if (!result.success) {
        const problems = result.error.issues.map(
          (issue) => `${issue.path.join('.') || 'options'}: ${issue.message}`,
        )
        throw new PluginLoadError(
          `Plugin "${entry.package}" has invalid options: ${problems.join('; ')}`,
        )
      }
      options = result.data
    }
    plugins.push((module.default as (options: unknown) => Plugin)(options))
  }
  return plugins
}
