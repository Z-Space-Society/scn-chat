import type { BlobRef, PartViewProps } from './types.ts'

/**
 * A picture, with a hairline drawn just inside so a light one doesn't bleed into the panel. It
 * loads once it nears the screen, so a long chat doesn't fetch every picture when it opens.
 */
export function ImageView(props: PartViewProps) {
  const image = props.part.image as BlobRef
  return (
    <img
      src={props.blobUrl(image.ref.$link, image.mimeType)}
      alt={(props.part.alt as string | undefined) ?? ''}
      loading="lazy"
      decoding="async"
      className="mb-1.5 max-w-full rounded-panel outline-1 outline-image-edge -outline-offset-1"
    />
  )
}
