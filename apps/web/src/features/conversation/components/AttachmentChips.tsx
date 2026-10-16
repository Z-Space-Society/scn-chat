import { cn } from '../../../shared/cn.ts'
import { CloseIcon } from '../../../shared/icons.tsx'
import { detailOf, FileChip } from '../../../shared/ui/FileChip.tsx'
import type { Attachment } from '../hooks/useAttachments.ts'

interface Props {
  attachments: Attachment[]
  onRemove: (attachment: Attachment) => void
  className?: string
}

/** A quiet round button that removes a chip from the composer. */
export const removeChip =
  'inline-flex flex-none cursor-pointer rounded-small p-0.5 text-muted hover:bg-hover hover:text-ink'

/**
 * The files a message will carry, at the top of the composer's card, each a file chip with its
 * kind and size, or "Uploading…" while it uploads, and a button to remove it. A name cut short
 * shows in full on hover.
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
        >
          <FileChip
            name={attachment.name}
            detail={
              attachment.part
                ? detailOf(attachment.name, attachment.type, attachment.size)
                : 'Uploading…'
            }
            preview={attachment.preview}
            end={
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => props.onRemove(attachment)}
                className={removeChip}
              >
                <CloseIcon />
              </button>
            }
          />
        </li>
      ))}
    </ul>
  )
}
