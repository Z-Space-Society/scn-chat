import { nsid } from '@scn-chat/lexicons/nsid'
import { useState } from 'react'
import { api, json, read } from '../api.ts'

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
  const [error, setError] = useState<string | null>(null)
  const model = models.find((m) => modelKey(m) === modelId)

  const attach = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith('image/') && model && !model.capabilities.vision) {
        setError('This model cannot read images.')
        continue
      }
      setUploading((n) => n + 1)
      try {
        const res = await fetch('/api/attachments', {
          method: 'POST',
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-filename': encodeURIComponent(file.name),
          },
          body: file,
        })
        const body = (await res.json()) as { part?: Record<string, unknown>; message?: string }
        if (!res.ok || !body.part) throw new Error(body.message ?? 'Upload failed')
        setAttachments((current) => [...current, body.part as Record<string, unknown>])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const send = async () => {
    if (!text.trim() && attachments.length === 0) return
    setError(null)
    const parts = [
      ...attachments,
      ...(text.trim() ? [{ $type: `${nsid.defs}#textPart`, text }] : []),
    ]
    const generation = {
      ...(model ? { model: { provider: model.provider, id: model.id } } : {}),
      ...(effort ? { effort } : {}),
    }
    try {
      const sent = await read(
        api.turns.conversations[':skey'].messages.$post(
          { param: { skey } },
          json({ parent, parts, generation }),
        ),
      )
      setText('')
      setAttachments([])
      onSent({ rkey: sent.rkey, replyRkey: sent.replyRkey })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sending failed')
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <textarea
        value={text}
        placeholder="Message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
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
          accept={model && !model.capabilities.vision ? 'application/pdf' : undefined}
          onChange={(e) => void attach(e.target.files)}
        />
        {uploading > 0 && <span>Uploading...</span>}
        {attachments.map((part, i) => (
          <span key={i}>{String(part.name ?? 'Image')}</span>
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
