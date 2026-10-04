import type { ModelRef } from '@scn-chat/lexicons'
import { nsid } from '@scn-chat/lexicons/nsid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, json, read } from '../api.ts'
import { lastError, messageOf } from '../lib/errors.ts'
import { type ModelOption, modelRef } from '../lib/models.ts'
import { attachmentTypesQuery } from '../queries.ts'
import { conversationRefreshKey } from '../store/react.tsx'
import { EffortSelect, ModelSelect } from './ModelSelect.tsx'
import { useModels } from './useModels.ts'

export type ComposerProps = {
  skey: string
  parent?: string
  /** The model of the nearest completed reply above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  initialText?: string
  onSent: (sent: { rkey: string; replyRkey: string | null }) => void
  onCancel?: () => void
}

/** The CID of an attachment part's image or file. */
const blobCid = (part: Record<string, unknown>) =>
  ((part.image ?? part.file) as { ref: { $link: string } }).ref.$link

/** What the attach button takes: any type an ingester reads, and images when the model sees them. */
function acceptedTypes(types: { images: string[]; files: string[] }, model: ModelOption | null) {
  // With the fallback model, the server checks vision when the turn starts.
  const images = !model || model.capabilities.vision
  return [...(images ? types.images : []), ...types.files].join(',')
}

/** Upload a file the composer will attach, returning its attachment part. */
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

/** The message box, with model and effort choice and attachments. */
export function Composer({
  skey,
  parent,
  inherited = null,
  initialText = '',
  onSent,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState(initialText)
  const { models, fallback } = useModels(inherited)
  const [model, setModel] = useState<ModelOption | null>(null)
  const [effort, setEffort] = useState('')
  const [attachments, setAttachments] = useState<Record<string, unknown>[]>([])
  const [uploading, setUploading] = useState(0)
  // A file this composer refused before uploading it.
  const [refused, setRefused] = useState<string | null>(null)
  // Without a fallback model, the server has nothing to run the turn with.
  const needsModel = !model && fallback === null
  // Effort is sent only while its select is shown, so switching models back keeps the choice.
  const chosenEffort = model?.capabilities.reasoning ? effort : ''
  const { data: types, error: typesError } = useQuery(attachmentTypesQuery)
  const queryClient = useQueryClient()
  const accept = types && acceptedTypes(types, model)

  // Several uploads can run at once, so each one counts while it runs.
  const uploadingFile = useMutation({
    mutationFn: uploadAttachment,
    onMutate: () => setUploading((n) => n + 1),
    onSuccess: ({ part }) => setAttachments((current) => [...current, part]),
    onSettled: () => setUploading((n) => n - 1),
  })
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
      ...(model ? { model: modelRef(model) } : {}),
      ...(chosenEffort ? { effort: chosenEffort } : {}),
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
        <ModelSelect aria-label="Model" models={models} value={model} onChange={setModel}>
          {fallback === null ? (
            <option value="" disabled>
              Choose a model
            </option>
          ) : (
            <option value="">Default model</option>
          )}
        </ModelSelect>
        {model?.capabilities.reasoning && (
          <EffortSelect aria-label="Effort" value={effort} onChange={setEffort}>
            <option value="">Default effort</option>
          </EffortSelect>
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
