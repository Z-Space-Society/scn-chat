import type { BlobRef, PartViewProps } from './types.ts'

/** A picture, with a hairline drawn just inside so a light one doesn't bleed into the panel. */
export function ImageView(props: PartViewProps) {
  const image = props.part.image as BlobRef
  return (
    <img
      src={props.blobUrl(image.ref.$link, image.mimeType)}
      alt={(props.part.alt as string | undefined) ?? ''}
      className="mb-1.5 max-w-full rounded-panel outline-1 outline-image-edge -outline-offset-1"
    />
  )
}
