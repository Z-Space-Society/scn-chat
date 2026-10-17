import type { ReactNode } from 'react'
import { AlertIcon, StopIcon } from '../../../shared/icons.tsx'
import type { MessageRecord } from '../../../shared/message.ts'
import { Badge } from '../../../shared/ui/Badge.tsx'

/**
 * A quiet line about a reply, such as that it waits its turn or lost its stream. It breathes as
 * the model's name does while the reply waits, since each is something still going.
 */
export const statusLine =
  'animate-breathe font-medium text-muted text-ui motion-reduce:animate-none'

interface Props {
  record: MessageRecord
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
            {props.record.error && (
              <p className="mt-0.5 text-danger-muted [overflow-wrap:anywhere]">
                {props.record.error}
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
