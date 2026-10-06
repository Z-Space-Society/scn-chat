import type { Logger, Plugin } from '@scn-chat/plugin-api'
import type { z } from 'zod'
import { describeIssues, type Issue, issuesOf } from '../body.ts'
import type { ModelCatalog } from '../providers/catalog.ts'
import { safeErrorMessage } from '../safe-error.ts'
import { type LoadDeps, loadPlugins, type PluginHost } from './host.ts'
import type { InstalledPlugins } from './installed.ts'
import type { PluginInstance } from './instances.ts'

export type InstanceStatus =
  | { state: 'loaded'; pluginId: string; name: string }
  | { state: 'disabled' }
  | { state: 'failed'; error: string; issues: Issue[] }

/** Everything built from the plugin instances: the plugin host and the model catalog over it. */
export type PluginRuntime = {
  host: PluginHost
  catalog: ModelCatalog
  statuses: ReadonlyMap<string, InstanceStatus>
}

/** A plugin instance that can't be loaded, with the option fields at fault when there are any. */
export class PluginInstanceError extends Error {
  readonly instanceId: string
  readonly issues: Issue[]

  constructor(instanceId: string, message: string, issues: Issue[] = []) {
    super(message)
    this.name = 'PluginInstanceError'
    this.instanceId = instanceId
    this.issues = issues
  }
}

export type RuntimeBuilder = (instances: PluginInstance[]) => Promise<PluginRuntime>

export type RuntimeBuilderDeps = {
  installed: InstalledPlugins
  load: LoadDeps
  catalog: (host: PluginHost) => ModelCatalog
  logger: Logger
}

/** The schema with unknown keys ignored, so options a plugin dropped in an upgrade don't break it. */
const lenient = (schema: z.ZodType): z.ZodType =>
  'strip' in schema && typeof schema.strip === 'function' ? (schema.strip() as z.ZodType) : schema

/** Validate an instance's options and call its plugin's factory. */
export function instantiate(installed: InstalledPlugins, instance: PluginInstance): Plugin {
  const found = installed.get(instance.package)
  if (!found)
    throw new PluginInstanceError(
      instance.id,
      `The plugin package "${instance.package}" isn't installed`,
    )
  let options: unknown = { ...instance.options, ...instance.secrets }
  if (found.optionsSchema) {
    const result = lenient(found.optionsSchema).safeParse(options)
    if (!result.success) {
      const issues = issuesOf(result.error)
      throw new PluginInstanceError(
        instance.id,
        `Invalid options for "${instance.package}": ${describeIssues(issues, 'options')}`,
        issues,
      )
    }
    options = result.data
  }
  try {
    return found.factory(options)
  } catch (err) {
    throw new PluginInstanceError(
      instance.id,
      `"${instance.package}" failed to start: ${safeErrorMessage(err)}`,
    )
  }
}

/** Build a runtime from plugin instances, skipping any that fail and recording why. */
export function runtimeBuilder(deps: RuntimeBuilderDeps): RuntimeBuilder {
  return async (instances) => {
    const statuses = new Map<string, InstanceStatus>()
    const plugins: Plugin[] = []
    const owners: string[] = []
    const fail = (err: PluginInstanceError) => {
      deps.logger.warn({ err, instance: err.instanceId }, 'skipping a plugin that failed to load')
      statuses.set(err.instanceId, { state: 'failed', error: err.message, issues: err.issues })
    }
    for (const instance of instances) {
      if (!instance.enabled) {
        statuses.set(instance.id, { state: 'disabled' })
        continue
      }
      try {
        plugins.push(instantiate(deps.installed, instance))
        owners.push(instance.id)
      } catch (err) {
        if (!(err instanceof PluginInstanceError)) throw err
        fail(err)
      }
    }
    const failures: PluginInstanceError[] = []
    const host = await loadPlugins(plugins, deps.load, {
      onFailure: (index, error) =>
        failures.push(
          new PluginInstanceError(
            owners[index] as string,
            `Plugin "${plugins[index]?.id}" failed to load: ${safeErrorMessage(error)}`,
          ),
        ),
    })
    for (const failure of failures) fail(failure)
    for (const plugin of host.plugins) {
      const owner = owners[plugins.indexOf(plugin)] as string
      statuses.set(owner, { state: 'loaded', pluginId: plugin.id, name: plugin.name })
    }
    return { host, catalog: deps.catalog(host), statuses }
  }
}

export type RuntimeLease = { runtime: PluginRuntime; release(): void }

/** Holds the current plugin runtime, and closes replaced ones once nothing uses them. */
export class RuntimeHolder {
  private runtime: PluginRuntime
  private readonly leases = new Map<PluginRuntime, number>()
  private readonly retiring = new Set<PluginRuntime>()
  private queue: Promise<unknown> = Promise.resolve()
  private readonly logger: Logger

  constructor(runtime: PluginRuntime, logger: Logger) {
    this.runtime = runtime
    this.logger = logger
  }

  current(): PluginRuntime {
    return this.runtime
  }

  /** Hold the current runtime until release, so a swap doesn't close it mid-use. */
  acquire(): RuntimeLease {
    const runtime = this.runtime
    this.leases.set(runtime, (this.leases.get(runtime) ?? 0) + 1)
    let released = false
    return {
      runtime,
      release: () => {
        if (released) return
        released = true
        const left = (this.leases.get(runtime) ?? 1) - 1
        if (left > 0) return void this.leases.set(runtime, left)
        this.leases.delete(runtime)
        if (this.retiring.has(runtime)) this.closeRuntime(runtime)
      },
    }
  }

  /** Make the runtime current. The old one closes when its last lease is released. */
  swap(next: PluginRuntime): void {
    const old = this.runtime
    this.runtime = next
    if (this.leases.has(old)) this.retiring.add(old)
    else this.closeRuntime(old)
  }

  /** Run changes one at a time. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  async close(): Promise<void> {
    await this.runtime.host.close()
  }

  private closeRuntime(runtime: PluginRuntime) {
    this.retiring.delete(runtime)
    runtime.host
      .close()
      .catch((err) => this.logger.warn({ err }, 'closing a replaced plugin runtime failed'))
  }
}
