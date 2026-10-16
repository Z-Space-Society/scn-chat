import { ArrowOutIcon, DownloadIcon } from '../shared/icons.tsx'
import { detailOf, FileChip } from '../shared/ui/FileChip.tsx'
import type { BlobRef, PartViewProps } from './types.ts'

/**
 * A file as the chip it was in the composer, its kind and size under its name, ending in an icon
 * for what opening it does, as wide as the composer's remove button. A PDF opens in a new tab in
 * the browser's own viewer, and anything else downloads under its name.
 */
export function FileView(props: PartViewProps) {
  const file = props.part.file as BlobRef
  const name = props.part.name as string | undefined
  const pdf = file.mimeType === 'application/pdf'
  const label = name ?? 'Attached file'
  const size = typeof file.size === 'number' ? file.size : undefined
  const Icon = pdf ? ArrowOutIcon : DownloadIcon
  return (
    <a
      href={props.blobUrl(file.ref.$link, pdf ? file.mimeType : undefined)}
      {...(pdf ? { target: '_blank', rel: 'noreferrer' } : { download: name ?? '' })}
      title={label}
      className="flex w-fit max-w-full rounded-quote no-underline"
    >
      <FileChip
        name={label}
        detail={detailOf(label, file.mimeType, size)}
        end={
          <span className="inline-flex flex-none p-0.5 text-muted">
            <Icon />
          </span>
        }
      />
    </a>
  )
}
