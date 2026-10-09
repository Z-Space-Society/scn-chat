import type { BlobRef, PartViewProps } from './types.ts'

export function FileView(props: PartViewProps) {
  const file = props.part.file as BlobRef
  return (
    <a href={props.blobUrl(file.ref.$link)}>
      {(props.part.name as string | undefined) ?? 'Attached file'}
    </a>
  )
}
