/** Chats grouped under a date heading, such as "Today" or "September 2026". */
export type DateGroup<T> = { label: string; items: T[] }

const DAY = 86_400_000

/** The start of the local day containing `date`. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** The heading for a chat last updated at `updated`, seen from `now`, in local time. */
export function dateLabel(updated: Date, now: Date): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(updated).getTime()) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 days'
  if (days < 30) return 'Previous 30 days'
  return updated.toLocaleDateString(undefined, {
    month: 'long',
    year: updated.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/** Group chats, already newest first, under date headings in the same order. */
export function groupByDate<T extends { updatedAt: string }>(
  items: T[],
  now = new Date(),
): DateGroup<T>[] {
  const groups: DateGroup<T>[] = []
  for (const item of items) {
    const updated = new Date(item.updatedAt)
    const label = Number.isNaN(updated.getTime()) ? 'Older' : dateLabel(updated, now)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/** Relative times in the interface's language, which a translation changes along with the copy. */
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** How long ago a time was, such as "just now", "5 minutes ago", or "1 hour ago". */
export function timeAgo(then: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
