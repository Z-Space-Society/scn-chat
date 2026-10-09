import { useIsMutating, useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { api, read } from '../../../shared/api.ts'

/** Upload a file to attach, returning its attachment part. */
const uploadAttachment = (file: File) =>
  read(
    api.blobs.attachments.$post(
      {},
      {
        init: {
          body: file,
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name),
          },
        },
      },
    ),
  )

/**
 * Files attached to a message, uploaded as they are picked. Several can upload at once, and
 * images are refused when the model can't see them.
 */
export function useAttachments(seesImages: boolean) {
  const [parts, setParts] = useState<Record<string, unknown>[]>([])
  // A file refused before uploading it.
  const [refused, setRefused] = useState<string | null>(null)
  // Its own key, so only this composer's uploads count.
  const mutationKey = ['attachment-upload', useId()]
  const upload = useMutation({
    mutationKey,
    mutationFn: uploadAttachment,
    onSuccess: ({ part }) => setParts((current) => [...current, part]),
  })
  const uploading = useIsMutating({ mutationKey }) > 0

  const attach = (files: FileList | null) => {
    setRefused(null)
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith('image/') && !seesImages)
        setRefused('This model cannot read images.')
      else upload.mutate(file)
    }
  }

  return {
    parts,
    uploading,
    upload,
    refused,
    attach,
    dismissRefused: () => setRefused(null),
    /** Forget the attachments, once they are sent. */
    clear: () => setParts([]),
  }
}
