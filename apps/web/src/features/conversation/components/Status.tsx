import type { ReactNode } from 'react'
import { AlertIcon, StopIcon } from '../../../shared/icons.tsx'
import { Badge } from '../../../shared/ui/Badge.tsx'

/** A quiet line about a reply, such as that it waits its turn or lost its stream. */
export const statusLine = 'text-muted text-ui'

interface Props {
  record: Record<string, unknown>
  /** What a failed reply offers beside its error, such as a button to try again. */
  retry?: ReactNode
}

/** A line for a message that failed or was stopped. A pending reply's header says it is waiting. */
export function Status(props: Props) {
  switch (props.record.status) {
    case 'error':
      // What went wrong in red ink, the provider's own message, often long and technical, in a
      // softer red, and the button to try again below it.
      return (
        <div role="alert" className="my-2.5 flex items-start gap-2 text-danger text-ui">
          <AlertIcon className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <strong className="font-medium">The reply failed</strong>
            {Boolean(props.record.error) && (
              <p className="mt-0.5 text-danger-muted [overflow-wrap:anywhere]">
                {props.record.error as string}
              </p>
            )}
            {props.retry}
          </div>
        </div>
      )
    case 'cancelled':
      // A small amber badge with the Stop button's square, tucked under where the reply broke off.
      return (
        <p className="mt-2.5">
          <Badge tone="warning" className="gap-1">
            <StopIcon className="size-2.5" />
            Stopped
          </Badge>
        </p>
      )
    default:
      return null
  }
}
