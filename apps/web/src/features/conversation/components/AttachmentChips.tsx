import { cn } from '../../../shared/cn.ts'
import { CloseIcon, FileIcon } from '../../../shared/icons.tsx'
import type { Attachment } from '../hooks/useAttachments.ts'

interface Props {
  attachments: Attachment[]
  onRemove: (attachment: Attachment) => void
  className?: string
}

/** A file's kind, from its extension, else its media type, such as "PDF" or "PNG". */
export function kindOf(name: string, type: string) {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]
  if (extension) return extension.toUpperCase()
  const subtype = type.split('/')[1]
  return subtype ? subtype.toUpperCase() : 'File'
}

/** A size in bytes as a short reading, such as "820 B", "14 KB", or "2.4 MB". */
export function sizeOf(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A quiet round button that removes a chip from the composer. */
export const removeChip =
  'inline-flex flex-none cursor-pointer rounded-small p-0.5 text-muted hover:bg-hover hover:text-ink'

/** A chip's picture, inset from its corner by the chip's padding, so the two corners run together. */
const thumbnail =
  'size-8 flex-none rounded-[calc(var(--radius-quote)-(--spacing(1.5)))] transition-opacity duration-(--dur-feedback) in-data-[state=uploading]:opacity-50'

/**
 * The files a message will carry, at the top of the composer's card, each a chip with a preview or
 * a file icon in a tile the preview's size, its name over its kind and size, or "Uploading…" while
 * it uploads, and a button to remove it. A file's chip is drawn as a quote is, a well with the
 * quote's corner, and a name cut short shows in full on hover.
 */
export function AttachmentChips(props: Props) {
  if (props.attachments.length === 0) return null
  return (
    <ul aria-label="Attachments" className={cn('flex flex-wrap gap-1.5', props.className)}>
      {props.attachments.map((attachment) => (
        <li
          key={attachment.id}
          data-state={attachment.part ? 'ready' : 'uploading'}
          title={attachment.name}
          className="flex max-w-64 items-center gap-2 rounded-quote bg-well py-1.5 ps-1.5 pe-1 text-caption data-[state=uploading]:animate-breathe motion-reduce:animate-none"
        >
          {attachment.preview ? (
            <img
              src={attachment.preview}
              alt=""
              className={cn(
                thumbnail,
                'object-cover outline-1 outline-image-edge -outline-offset-1',
              )}
            />
          ) : (
            <span className={cn(thumbnail, 'grid place-items-center bg-raised text-muted')}>
              <FileIcon />
            </span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium text-ink-strong">{attachment.name}</span>
            <span className="text-caption text-muted tabular-nums">
              {attachment.part
                ? `${kindOf(attachment.name, attachment.type)} · ${sizeOf(attachment.size)}`
                : 'Uploading…'}
            </span>
          </span>
          <button
            type="button"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => props.onRemove(attachment)}
            className={removeChip}
          >
            <CloseIcon />
          </button>
        </li>
      ))}
    </ul>
  )
}
