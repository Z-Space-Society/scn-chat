import type { BlobRef, PartViewProps } from './types.ts'

export function ImageView(props: PartViewProps) {
  const image = props.part.image as BlobRef
  return (
    <img
      src={props.blobUrl(image.ref.$link, image.mimeType)}
      alt={(props.part.alt as string | undefined) ?? ''}
    />
  )
}
