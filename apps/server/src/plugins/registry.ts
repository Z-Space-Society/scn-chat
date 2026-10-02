import { type Ingester, matchIngester } from '@scn-chat/plugin-api'

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

  /** Throw if these items would clash with each other or with ones already registered. */
  assertFree(items: T[], pluginId: string): void {
    const seen = new Set<string>()
    for (const item of items) {
      const key = this.keyOf(item)
      const existing = this.items.get(key)
      if (existing)
        throw new DuplicateRegistrationError(this.kind, key, pluginId, existing.pluginId)
      if (seen.has(key)) throw new DuplicateRegistrationError(this.kind, key, pluginId, pluginId)
      seen.add(key)
    }
  }

  get(key: string): T | undefined {
    return this.items.get(key)?.item
  }

  /** Returns the ID of the plugin that registered the key. */
  owner(key: string): string | undefined {
    return this.items.get(key)?.pluginId
  }

  list(): T[] {
    return [...this.items.values()].map(({ item }) => item)
  }
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
    return matchIngester(this.list(), mimeType)
  }
}
