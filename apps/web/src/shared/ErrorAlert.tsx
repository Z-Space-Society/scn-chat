import { messageOf } from './errors.ts'

interface Props {
  /** An error or its message. Nothing renders when there is none. */
  error: unknown
}

export function ErrorAlert(props: Props) {
  if (!props.error) return null
  return <p role="alert">{messageOf(props.error)}</p>
}
