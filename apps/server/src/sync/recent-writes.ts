/** Records the server wrote and spaces it deleted recently, so sync can skip its own changes. */
export class RecentWrites {
  private readonly entries = new Map<string, number>()
  private readonly ttlMs: number

  constructor(ttlMs = 10 * 60_000) {
    this.ttlMs = ttlMs
  }

  add(cid: string, now = Date.now()): void {
    this.entries.set(cid, now + this.ttlMs)
    if (this.entries.size > 10_000) this.prune(now)
  }

  has(cid: string, now = Date.now()): boolean {
    const expires = this.entries.get(cid)
    if (expires === undefined) return false
    if (expires > now) return true
    this.entries.delete(cid)
    return false
  }

  /** Remember a space this server deleted, so sync can tell the deletion is its own. */
  addDeletion(space: string, now = Date.now()): void {
    this.add(`deleted ${space}`, now)
  }

  hasDeletion(space: string, now = Date.now()): boolean {
    return this.has(`deleted ${space}`, now)
  }

  private prune(now: number): void {
    for (const [cid, expires] of this.entries) if (expires <= now) this.entries.delete(cid)
  }
}
