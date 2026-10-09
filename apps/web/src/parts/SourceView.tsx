import type { PartViewProps } from './types.ts'

export function SourceView(props: PartViewProps) {
  const url = props.part.url as string
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {(props.part.title as string | undefined) ?? url}
    </a>
  )
}
