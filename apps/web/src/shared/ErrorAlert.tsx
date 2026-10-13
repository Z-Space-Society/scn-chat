import { cn } from './cn.ts'
import { messageOf } from './errors.ts'

interface Props {
  /** An error or its message. Nothing renders when there is none. */
  error: unknown
  className?: string
}

export function ErrorAlert(props: Props) {
  if (!props.error) return null
  return (
    <p role="alert" className={cn('text-danger', props.className)}>
      {messageOf(props.error)}
    </p>
  )
}
