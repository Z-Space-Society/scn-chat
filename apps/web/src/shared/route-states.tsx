import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ErrorAlert } from './ErrorAlert.tsx'

/**
 * What a route shows when its loader or a query it suspends on fails, in place of the route, so
 * the layouts around it stay. Retry runs the loader again.
 */
export function RouteError(props: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  // A failed suspense query throws again when the route renders unless its boundary is reset.
  useEffect(() => queryErrorResetBoundary.reset(), [queryErrorResetBoundary])
  return (
    <section>
      <ErrorAlert error={props.error} />
      <button type="button" onClick={() => void router.invalidate()}>
        Retry
      </button>
    </section>
  )
}

/** What a route shows while it loads, once loading takes long enough to notice. */
export function RoutePending() {
  return <p>Loading…</p>
}
