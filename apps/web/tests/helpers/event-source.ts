import { vi } from 'vitest'

/** A stand-in for the browser's EventSource, which jsdom lacks, driven by the test. */
export class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, ((event: { data: string }) => void)[]>()
  onerror: (() => void) | null = null
  closed = false
  readonly url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  /** Send an event with a JSON body, as the server does. */
  emit(type: string, data: object) {
    this.emitRaw(type, JSON.stringify(data))
  }
  emitRaw(type: string, data: string) {
    if (this.closed) return
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }
  close() {
    this.closed = true
  }
}

/** Put the fake in place of EventSource, with no connections opened yet. */
export function stubEventSource() {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
}

/** The connection opened last. */
export const lastSource = () => FakeEventSource.instances.at(-1) as FakeEventSource
