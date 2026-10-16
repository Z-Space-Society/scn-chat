import type { ReactNode } from 'react'
import { cn } from '../cn.ts'
import { FileIcon } from '../icons.tsx'

/** A file's kind, from its extension, else its media type, such as "PDF" or "PNG". */
function kindOf(name: string, type: string) {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]
  if (extension) return extension.toUpperCase()
  const subtype = type.split('/')[1]
  return subtype ? subtype.toUpperCase() : 'File'
}

/** A size in bytes as a short reading, such as "820 B", "14 KB", or "2.4 MB". */
function sizeOf(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A file's kind and, when known, its size, as "PDF · 1.2 MB". */
export function detailOf(name: string, type: string, size?: number) {
  const kind = kindOf(name, type)
  return size === undefined ? kind : `${kind} · ${sizeOf(size)}`
}

interface Props {
  name: string
  /** The line under the name, such as "PDF · 1.2 MB", or "Uploading…" while it uploads. */
  detail: string
  /** A picture of the file, such as an image's local preview. Without one, a file icon stands in. */
  preview?: string
  /** What ends the chip, such as a button that removes it or an icon for what opening it does. */
  end: ReactNode
}

/** The chip's picture, inset from its corner by the chip's padding, so the two corners run together. */
const thumbnail =
  'size-8 flex-none rounded-[calc(var(--radius-quote)-(--spacing(1.5)))] transition-opacity duration-(--dur-feedback) in-data-[state=uploading]:opacity-50'

/**
 * A file as a chip: a preview or a file icon in a tile the preview's size, its name over its
 * detail, and whatever ends it. It is drawn as a quote is, a well with the quote's corner, and
 * fills what holds it, a list item in the composer or a link in a message, which names it. Inside
 * a link it takes the tint of the sources chip on hover, and inside something marked uploading it
 * breathes. Its name and detail are both at medium weight, as a chip's label is, like the sources
 * chip's, rather than regular like the details under a list item's name, so only the detail's
 * grey sets the two lines apart.
 */
export function FileChip(props: Props) {
  return (
    <span className="flex max-w-64 in-data-[state=uploading]:animate-breathe items-center gap-2 rounded-quote bg-well py-1.5 ps-1.5 pe-1 text-caption transition-colors duration-(--dur-feedback) in-[a]:hover:bg-accent-soft motion-reduce:animate-none">
      {props.preview ? (
        <img
          src={props.preview}
          alt=""
          className={cn(thumbnail, 'object-cover outline-1 outline-image-edge -outline-offset-1')}
        />
      ) : (
        <span className={cn(thumbnail, 'grid place-items-center bg-raised text-muted')}>
          <FileIcon />
        </span>
      )}
      <span className="flex min-w-0 flex-col font-medium leading-tight">
        <span className="truncate text-ink-strong">{props.name}</span>
        <span className="text-muted tabular-nums">{props.detail}</span>
      </span>
      {props.end}
    </span>
  )
}
