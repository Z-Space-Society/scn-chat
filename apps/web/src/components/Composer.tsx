import { nsid } from '@scn-chat/lexicons/nsid'
import { useEffect, useState } from 'react'
import { api, json, read } from '../api.ts'
import { messageOf, useAction } from './useAction.ts'

export type ModelOption = {
  provider: string
  id: string
  name: string
  capabilities: { vision: boolean; reasoning: boolean; tools: boolean }
}

export type ComposerProps = {
  skey: string
  parent?: string
  models: ModelOption[]
  initialModel?: { provider: string; id: string } | null
  initialText?: string
  onSent: (sent: { rkey: string; replyRkey: string | null }) => void
  onCancel?: () => void
}

/** The CID of an attachment part's image or file. */
const blobCid = (part: Record<string, unknown>) =>
  ((part.image ?? part.file) as { ref: { $link: string } }).ref.$link

export const modelKey = (m: { provider: string; id: string }) => `${m.provider}/${m.id}`

/** The message box, with model and effort choice and attachments. */
export function Composer({
  skey,
  parent,
  models,
  initialModel,
  initialText = '',
  onSent,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [modelId, setModelId] = useState(initialModel ? modelKey(initialModel) : '')
  const [effort, setEffort] = useState('')
  const [attachments, setAttachments] = useState<Record<string, unknown>[]>([])
  const [uploading, setUploading] = useState(0)
  const { error, run, fail } = useAction()
  const model = models.find((m) => modelKey(m) === modelId)
  const [types, setTypes] = useState<{ images: string[]; files: string[] } | null>(null)
  useEffect(() => {
    read(api.blobs.attachments.types.$get()).then(setTypes, (err: unknown) =>
      fail(`Could not load the attachment types: ${messageOf(err)}`),
    )
  }, [fail])
  // With the default model chosen, the server checks vision when the turn starts.
  const images = !model || model.capabilities.vision
  const accept = types && [...(images ? types.images : []), ...types.files].join(',')

  const upload = async (file: File) => {
    setUploading((n) => n + 1)
    try {
      const { part } = await read(
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
      setAttachments((current) => [...current, part])
    } finally {
      setUploading((n) => n - 1)
    }
  }

  const attach = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith('image/') && model && !model.capabilities.vision)
        fail('This model cannot read images.')
      else run(() => upload(file))
    }
  }

  const send = async () => {
    if (uploading > 0 || (!text.trim() && attachments.length === 0)) return
    const parts = [
      ...attachments,
      ...(text.trim() ? [{ $type: `${nsid.defs}#textPart`, text }] : []),
    ]
    const generation = {
      ...(model ? { model: { provider: model.provider, id: model.id } } : {}),
      ...(effort ? { effort } : {}),
    }
    const sent = await read(
      api.turns.conversations[':skey'].messages.$post(
        { param: { skey } },
        json({ parent, parts, generation }),
      ),
    )
    setText('')
    setAttachments([])
    onSent({ rkey: sent.rkey, replyRkey: sent.replyRkey })
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        run(send)
      }}
    >
      <textarea
        value={text}
        placeholder="Message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            run(send)
          }
        }}
      />
      <div>
        <select aria-label="Model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="">Default model</option>
          {models.map((m) => (
            <option key={modelKey(m)} value={modelKey(m)}>
              {m.name}
            </option>
          ))}
        </select>
        {model?.capabilities.reasoning && (
          <select aria-label="Effort" value={effort} onChange={(e) => setEffort(e.target.value)}>
            <option value="">Default effort</option>
            {['none', 'low', 'medium', 'high', 'max'].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label="Attach"
          type="file"
          multiple
          accept={accept ?? undefined}
          onChange={(e) => attach(e.target.files)}
        />
        {uploading > 0 && <span>Uploading...</span>}
        {attachments.map((part) => (
          <span key={blobCid(part)}>{(part.name as string | undefined) ?? 'Image'}</span>
        ))}
        <button type="submit" disabled={uploading > 0}>
          Send
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
