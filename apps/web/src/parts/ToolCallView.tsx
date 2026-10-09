import type { PartViewProps } from './types.ts'

export function ToolCallView(props: PartViewProps) {
  return (
    <details>
      <summary>Tool call: {props.part.tool as string}</summary>
      <pre>{props.part.input as string}</pre>
    </details>
  )
}
