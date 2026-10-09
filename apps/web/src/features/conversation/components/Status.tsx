import type { ReactNode } from 'react'

interface Props {
  record: Record<string, unknown>
  /** What the pending message shows instead of "Thinking...", if anything. */
  pending?: ReactNode
}

/** A line for a message that is still thinking, failed, or was stopped. */
export function Status(props: Props) {
  switch (props.record.status) {
    case 'pending':
      if (props.pending !== undefined) return null
      return <p>Thinking...</p>
    case 'error':
      return (
        <p role="alert">Error{props.record.error ? `: ${props.record.error as string}` : ''}</p>
      )
    case 'cancelled':
      return <p>Stopped.</p>
    default:
      return null
  }
}
