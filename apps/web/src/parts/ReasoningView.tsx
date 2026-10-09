import type { PartViewProps } from './types.ts'

interface Props {
  text: string
}

/** A model's reasoning, collapsed. */
export function Reasoning(props: Props) {
  return (
    <details>
      <summary>Reasoning</summary>
      <p className="text">{props.text}</p>
    </details>
  )
}

export function ReasoningView(props: PartViewProps) {
  return <Reasoning text={(props.part.text as string | undefined) ?? ''} />
}
