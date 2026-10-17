import { type StoreChange, StoreCore } from './core.ts'
import { StoreClosed } from './errors.ts'
import { Unauthorized } from './http-api.ts'

/** A change in the store, or its sync finding that the session has ended. */
export type ClientChange = StoreChange | { type: 'unauthorized' }

type Method = {
  [K in keyof StoreCore]: StoreCore[K] extends (...args: never[]) => unknown ? K : never
}[keyof StoreCore]

/** The store as a tab calls it: every StoreCore method, answering asynchronously. */
export type StoreCalls = {
  [K in Method]: (...args: Parameters<StoreCore[K]>) => Promise<Awaited<ReturnType<StoreCore[K]>>>
}

/**
 * Every StoreCore method, run on the store `current` returns. A call while it returns none, as
 * when another tab holds the store, fails with StoreClosed, and a call that finds the session has
 * ended also emits that, so the page can act on it.
 */
export function storeCalls(
  current: () => StoreCore | undefined,
  emit: (change: ClientChange) => void,
): StoreCalls {
  const names = Object.getOwnPropertyNames(StoreCore.prototype).filter(
    (name) => name !== 'constructor',
  )
  const call = async (name: string, args: unknown[]) => {
    const core = current()
    if (!core) throw new StoreClosed()
    try {
      return await Reflect.apply(Reflect.get(core, name), core, args)
    } catch (err) {
      if (err instanceof Unauthorized) emit({ type: 'unauthorized' })
      throw err
    }
  }
  return Object.fromEntries(
    names.map((name) => [name, (...args: unknown[]) => call(name, args)]),
  ) as StoreCalls
}
