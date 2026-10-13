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
