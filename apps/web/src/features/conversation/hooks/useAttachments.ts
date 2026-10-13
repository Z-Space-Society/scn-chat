import { useEffect, useRef, useState } from 'react'
import { api, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'

/** A file the composer is attaching: uploading until its attachment part arrives. */
export type Attachment = {
  id: number
  name: string
  /** The file's media type, which may be empty when the browser can't tell. */
  type: string
  /** The file's size in bytes. */
  size: number
  /** A local preview of an image, revoked once the attachment goes. */
  preview?: string
  /** The attachment part the upload returned, once it has. */
  part?: Record<string, unknown>
  abort: AbortController
}

/** Upload a file the composer will attach, returning its attachment part. */
const uploadAttachment = (file: File, signal: AbortSignal) =>
  read(
    api.blobs.attachments.$post(
      {},
      {
        init: {
          body: file,
          signal,
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name),
          },
        },
      },
    ),
  )

/**
 * The composer's attachments. Each file uploads as soon as it is added and shows until it is
 * removed or sent, so removing one mid-upload cancels its upload.
 */
export function useAttachments(seesImages: boolean) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  // Why the last file added was turned away or failed to upload.
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(0)
  // Previews still in use, so leaving the composer frees them.
  const previews = useRef(new Set<string>())
  useEffect(() => {
    const live = previews.current
    return () => {
      for (const url of live) URL.revokeObjectURL(url)
    }
  }, [])

  const release = (attachment: Attachment) => {
    attachment.abort.abort()
    if (!attachment.preview) return
    URL.revokeObjectURL(attachment.preview)
    previews.current.delete(attachment.preview)
  }

  const add = (files: File[]) => {
    setError(null)
    for (const file of files) {
      const image = file.type.startsWith('image/')
      if (image && !seesImages) {
        setError(
          "This model can't read images. Choose a model that can, then attach the image again.",
        )
        continue
      }
      const attachment: Attachment = {
        id: nextId.current++,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: image ? URL.createObjectURL(file) : undefined,
        abort: new AbortController(),
      }
      if (attachment.preview) previews.current.add(attachment.preview)
      setAttachments((current) => [...current, attachment])
      uploadAttachment(file, attachment.abort.signal).then(
        ({ part }) =>
          setAttachments((current) =>
            current.map((a) => (a.id === attachment.id ? { ...a, part } : a)),
          ),
        (err: unknown) => {
          // Removing the attachment cancelled its upload, which is not a failure.
          if (attachment.abort.signal.aborted) return
          drop([attachment])
          setError(`Couldn't attach ${file.name}. ${messageOf(err)}`)
        },
      )
    }
  }

  /** Let go of attachments, as when they are removed or sent. Any added since stay. */
  const drop = (gone: Attachment[]) => {
    for (const attachment of gone) release(attachment)
    const ids = new Set(gone.map((a) => a.id))
    setAttachments((current) => current.filter((a) => !ids.has(a.id)))
  }

  return {
    attachments,
    add,
    drop,
    uploading: attachments.some((a) => !a.part),
    error,
    clearError: () => setError(null),
  }
}
