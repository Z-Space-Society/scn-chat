import type {
  ActionHooks,
  FilterHooks,
  HookHandler,
  HookName,
  HookOrder,
  Logger,
} from '@scn-chat/plugin-api'

type Entry = {
  pluginId: string
  position: number
  order: HookOrder
  handler: (...args: never[]) => unknown
}

const orderRank: Record<HookOrder, number> = { pre: 0, normal: 1, post: 2 }

export class PluginHookError extends Error {
  readonly pluginId: string
  readonly hook: HookName

  constructor(pluginId: string, hook: HookName, cause: unknown) {
    super(
      `Plugin "${pluginId}" failed in ${hook}: ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        cause,
      },
    )
    this.name = 'PluginHookError'
    this.pluginId = pluginId
    this.hook = hook
  }
}

/** Runs hook handlers in order: pre, normal, post, then by the plugin's place in the config. */
export class HookRunner {
  private readonly entries = new Map<HookName, Entry[]>()

  add<N extends HookName>(
    name: N,
    pluginId: string,
    position: number,
    handler: HookHandler<N>,
    order: HookOrder = 'normal',
  ) {
    const list = this.entries.get(name) ?? []
    list.push({ pluginId, position, order, handler: handler as Entry['handler'] })
    list.sort((a, b) => orderRank[a.order] - orderRank[b.order] || a.position - b.position)
    this.entries.set(name, list)
  }

  /** Pass a value through every filter, failing on the first handler that throws. */
  async filter<N extends keyof FilterHooks>(
    name: N,
    value: FilterHooks[N]['value'],
    context: FilterHooks[N]['context'],
  ): Promise<FilterHooks[N]['value']> {
    let current = value
    for (const entry of this.entries.get(name) ?? []) {
      try {
        current = await (entry.handler as (v: typeof current, c: typeof context) => typeof current)(
          current,
          context,
        )
      } catch (err) {
        throw new PluginHookError(entry.pluginId, name, err)
      }
    }
    return current
  }

  /** Run every action, logging failures without stopping the others. */
  async action<N extends keyof ActionHooks>(
    name: N,
    payload: ActionHooks[N],
    logger: Logger,
  ): Promise<void> {
    for (const entry of this.entries.get(name) ?? []) {
      try {
        await (entry.handler as (p: typeof payload) => unknown)(payload)
      } catch (err) {
        logger.error({ err, pluginId: entry.pluginId, hook: name }, 'plugin action failed')
      }
    }
  }

  /** The resolved handler order for each hook, by plugin ID. */
  describe(): Record<string, string[]> {
    return Object.fromEntries(
      [...this.entries].map(([name, list]) => [name, list.map((entry) => entry.pluginId)]),
    )
  }
}
