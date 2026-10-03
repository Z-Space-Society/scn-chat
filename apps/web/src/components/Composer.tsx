import { nsid } from '@scn-chat/lexicons/nsid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, json, read } from '../api.ts'
import { lastError, messageOf } from '../lib/errors.ts'
import { attachmentTypesQuery } from '../queries.ts'
import { conversationRefreshKey } from '../store/react.tsx'

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
  /** Whether the server picks a model when none is chosen. Without one, sending waits for a choice. */
  hasDefault: boolean
  initialText?: string
  onSent: (sent: { rkey: string; replyRkey: string | null }) => void
  onCancel?: () => void
}

/** The CID of an attachment part's image or file. */
const blobCid = (part: Record<string, unknown>) =>
  ((part.image ?? part.file) as { ref: { $link: string } }).ref.$link

export const modelKey = (m: { provider: string; id: string }) => `${m.provider}/${m.id}`

/** What the attach button takes: any type an ingester reads, and images when the model sees them. */
function acceptedTypes(types: { images: string[]; files: string[] }, model?: ModelOption): string {
  // With the default model chosen, the server checks vision when the turn starts.
  const images = !model || model.capabilities.vision
  return [...(images ? types.images : []), ...types.files].join(',')
}

/** The model choice. "Default model" is offered only when the server has one to fall back to. */
function ModelSelect({
  models,
  hasDefault,
  value,
  onChange,
}: {
  models: ModelOption[]
  hasDefault: boolean
  value: string
  onChange: (value: string) => void
}) {
  return (
    <select aria-label="Model" value={value} onChange={(e) => onChange(e.target.value)}>
      {hasDefault ? (
        <option value="">Default model</option>
      ) : (
        <option value="" disabled>
          Choose a model
        </option>
      )}
      {models.map((m) => (
        <option key={modelKey(m)} value={modelKey(m)}>
          {m.name}
        </option>
      ))}
    </select>
  )
}

function EffortSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select aria-label="Effort" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Default effort</option>
      {['none', 'low', 'medium', 'high', 'max'].map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  )
}

/** The message box, with model and effort choice and attachments. */
export function Composer({
  skey,
  parent,
  models,
  hasDefault,
  initialText = '',
  onSent,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState(initialText)
  const [modelId, setModelId] = useState('')
  const [effort, setEffort] = useState('')
  const [attachments, setAttachments] = useState<Record<string, unknown>[]>([])
  const [uploading, setUploading] = useState(0)
  // A file this composer refused before uploading it.
  const [refused, setRefused] = useState<string | null>(null)
  const model = models.find((m) => modelKey(m) === modelId)
  const needsModel = !model && !hasDefault
  const { data: types, error: typesError } = useQuery(attachmentTypesQuery)
  const queryClient = useQueryClient()
  const accept = types && acceptedTypes(types, model)

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

  const uploadingFile = useMutation({ mutationFn: upload })
  const attach = (files: FileList | null) => {
    setRefused(null)
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith('image/') && model && !model.capabilities.vision)
        setRefused('This model cannot read images.')
      else uploadingFile.mutate(file)
    }
  }

  const send = async () => {
    if (needsModel || uploading > 0 || (!text.trim() && attachments.length === 0)) return
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
  const sending = useMutation({
    mutationFn: send,
    // Refreshing picks up the sent message without waiting for the stream.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationRefreshKey(skey) }),
  })
  const submit = () => {
    setRefused(null)
    sending.mutate()
  }
  const error =
    refused ??
    lastError(uploadingFile, sending) ??
    (typesError && `Could not load the attachment types: ${messageOf(typesError)}`)

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        aria-label="Message"
        value={text}
        placeholder="Message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div>
        <ModelSelect
          models={models}
          hasDefault={hasDefault}
          value={modelId}
          onChange={setModelId}
        />
        {model?.capabilities.reasoning && <EffortSelect value={effort} onChange={setEffort} />}
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
        <button type="submit" disabled={needsModel || uploading > 0}>
          Send
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {needsModel && <p>Choose a model, or set a default model in Settings.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
