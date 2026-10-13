/** Short local times, so a reader can tell how fresh something is. */

const DAY = 86_400_000

/** The start of the local day containing `date`. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** Whole local days from `date` to `now`. */
const daysBetween = (date: Date, now: Date) =>
  Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY)

const clock = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

const day = (date: Date, now: Date) =>
  date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })

/** When something happened, briefly for a list: the time today, Yesterday, else the date. */
export function shortTime(date: Date, now = new Date()): string {
  const days = daysBetween(date, now)
  if (days <= 0) return clock(date)
  if (days === 1) return 'Yesterday'
  return day(date, now)
}

/** A date from an ISO string, or none when it isn't one. */
export function parseDate(iso: unknown): Date | null {
  if (typeof iso !== 'string') return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
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
