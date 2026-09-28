import type { Ingester } from '@scn-chat/plugin-api'

export class DuplicateRegistrationError extends Error {
  constructor(kind: string, key: string, pluginId: string, existingPluginId: string) {
    super(
      `Plugin "${pluginId}" registered ${kind} "${key}", which plugin "${existingPluginId}" already registered`,
    )
    this.name = 'DuplicateRegistrationError'
  }
}

/** Implementations picked by a unique key. */
export class Registry<T> {
  private readonly items = new Map<string, { item: T; pluginId: string }>()
  private readonly kind: string
  private readonly keyOf: (item: T) => string

  constructor(kind: string, keyOf: (item: T) => string) {
    this.kind = kind
    this.keyOf = keyOf
  }

  register(item: T, pluginId: string): void {
    const key = this.keyOf(item)
    const existing = this.items.get(key)
    if (existing) throw new DuplicateRegistrationError(this.kind, key, pluginId, existing.pluginId)
    this.items.set(key, { item, pluginId })
  }

  get(key: string): T | undefined {
    return this.items.get(key)?.item
  }

  list(): T[] {
    return [...this.items.values()].map(({ item }) => item)
  }
}

function accepts(pattern: string, mimeType: string): boolean {
  return pattern.endsWith('/*') ? mimeType.startsWith(pattern.slice(0, -1)) : pattern === mimeType
}

/** Ingesters, matched by MIME type with the highest priority winning. */
export class IngesterRegistry extends Registry<Ingester> {
  constructor() {
    super('ingester', (ingester) => ingester.id)
  }

  /** Every MIME type pattern some ingester accepts. */
  accepted(): string[] {
    return [...new Set(this.list().flatMap((ingester) => ingester.accepts))]
  }

  match(mimeType: string): Ingester | undefined {
    let best: Ingester | undefined
    for (const ingester of this.list()) {
      if (!ingester.accepts.some((pattern) => accepts(pattern, mimeType))) continue
      if (!best || (ingester.priority ?? 0) > (best.priority ?? 0)) best = ingester
    }
    return best
  }
}
