import { CopyButton } from './CopyButton.tsx'

interface Props {
  /** The secret or command, which wraps so it reads whole, with Copy at its first line. */
  text: string
}

/** A secret or command to copy: its mono text in a field, with its Copy button. */
export function Secret(props: Props) {
  return (
    <div className="mt-2.5 flex items-start gap-2 rounded-secret border border-line bg-raised py-1.5 ps-3 pe-1.5">
      <code className="min-w-0 flex-1 whitespace-pre-wrap py-0.5 text-ink-strong text-small leading-normal [overflow-wrap:anywhere]">
        {props.text}
      </code>
      <CopyButton text={props.text} className="flex-none px-2.5 py-0.75 text-caption" />
    </div>
  )
}
