import type { StreamEvent } from './accumulator.ts'

export type HubEvent =
  | StreamEvent
  | { type: 'queued' }
  | { type: 'status'; status: string; error?: string }

type Channel = { events: HubEvent[]; listeners: Set<(event: HubEvent) => void>; done: boolean }

/** Buffers each running turn's events so a late subscriber can catch up, then follow live. */
export class StreamHub {
  private readonly channels = new Map<string, Channel>()
  private readonly retainMs: number

  constructor(retainMs = 60_000) {
    this.retainMs = retainMs
  }

  private channel(key: string): Channel {
    let channel = this.channels.get(key)
    if (!channel) {
      channel = { events: [], listeners: new Set(), done: false }
      this.channels.set(key, channel)
    }
    return channel
  }

  /** Open a turn's channel as soon as it's claimed. */
  open(key: string): void {
    this.channel(key)
  }

  publish(key: string, event: HubEvent): void {
    const channel = this.channel(key)
    channel.events.push(event)
    for (const listener of channel.listeners) listener(event)
    if (event.type === 'status') {
      channel.done = true
      setTimeout(() => {
        if (this.channels.get(key) === channel) this.channels.delete(key)
      }, this.retainMs).unref()
    }
  }

  has(key: string): boolean {
    return this.channels.has(key)
  }

  /** Replay buffered events, then deliver live ones until the turn ends. */
  subscribe(key: string, listener: (event: HubEvent) => void): () => void {
    const channel = this.channel(key)
    for (const event of channel.events) listener(event)
    if (channel.done) return () => {}
    channel.listeners.add(listener)
    return () => channel.listeners.delete(listener)
  }
}
