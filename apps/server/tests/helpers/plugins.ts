import type { Plugin } from '@scn-chat/plugin-api'
import type { z } from 'zod'
import type { InstalledPlugin, InstalledPlugins } from '../../src/plugins/installed.ts'

type Entry = { factory: (options: never) => Plugin; optionsSchema?: z.ZodType; multiple?: boolean }

/** Installed plugins built from factories, keyed by package name, without importing packages. */
export function installedFrom(entries: Record<string, Entry>): InstalledPlugins {
  return new Map(
    Object.entries(entries).map(([name, entry]): [string, InstalledPlugin] => [
      name,
      {
        package: name,
        description: `${name} for tests`,
        version: '1.0.0',
        factory: entry.factory as (options: unknown) => Plugin,
        ...(entry.optionsSchema ? { optionsSchema: entry.optionsSchema } : {}),
        multiple: entry.multiple ?? false,
      },
    ]),
  )
}
