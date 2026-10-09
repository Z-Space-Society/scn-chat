import type { PartViewProps } from './types.ts'

export function ToolResultView(props: PartViewProps) {
  return (
    <details>
      <summary>{props.part.isError ? 'Tool error' : 'Tool result'}</summary>
      <pre>{props.part.output as string}</pre>
    </details>
  )
}
