import { ClientOnly } from '@tanstack/react-router'

interface Props {
  /** An ISO date, or nothing for `fallback`. */
  date: string | null | undefined
  fallback?: string
}

/**
 * A date in the browser's locale and time zone. It renders only in the browser, since the server's
 * locale and zone would not match the browser's when hydrating.
 */
export function LocalTime(props: Props) {
  return (
    <ClientOnly>{props.date ? new Date(props.date).toLocaleString() : props.fallback}</ClientOnly>
  )
}
