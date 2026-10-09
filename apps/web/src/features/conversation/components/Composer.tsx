import type { ModelRef } from '@scn-chat/lexicons'
import { nsid } from '@scn-chat/lexicons/nsid'
import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { BlobRef } from '../../../parts/types.ts'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { conversationRefreshKey } from '../../../store/react.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { sameModel } from '../../models/models.ts'
import { useAttachments } from '../hooks/useAttachments.ts'
import { attachmentTypesQuery } from '../queries.ts'
import { ModelPicker } from './ModelPicker.tsx'

export interface ComposerProps {
  skey: string
  parent?: string
  /** The model of the nearest completed reply above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  initialText?: string
  onSent: (sent: { rkey: string; replyRkey: string | null }) => void
  onCancel?: () => void
}

interface Draft {
  text: string
  /** The chosen model by reference, so its capabilities come from the current catalog. */
  model: ModelRef | null
  effort: string
}

/** The CID of an attachment part's image or file. */
const blobCid = (part: Record<string, unknown>) => ((part.image ?? part.file) as BlobRef).ref.$link

/** What the attach button takes: any type an ingester reads, and images when the model sees them. */
const acceptedTypes = (types: { images: string[]; files: string[] }, images: boolean) =>
  [...(images ? types.images : []), ...types.files].join(',')

/** The message box, with model and effort choice and attachments. */
export function Composer(props: ComposerProps) {
  const { models, fallback, noModels } = useModels(props.inherited ?? null)
  const queryClient = useQueryClient()
  const sending = useMutation({
    mutationFn: (body: { parts: Record<string, unknown>[]; generation: object }) =>
      read(
        api.turns.conversations[':skey'].messages.$post(
          { param: { skey: props.skey } },
          json({ parent: props.parent, ...body }),
        ),
      ),
    onSuccess: (sent) => {
      attachments.clear()
      props.onSent({ rkey: sent.rkey, replyRkey: sent.replyRkey })
      // Refreshing picks up the sent message without waiting for the stream.
      return queryClient.invalidateQueries({ queryKey: conversationRefreshKey(props.skey) })
    },
  })
  const form = useAppForm({
    defaultValues: { text: props.initialText ?? '', model: null, effort: '' } as Draft,
    // The attachments and what the chosen model allows depend on the form's values, so they come
    // below, and submitting reads them as they are when it runs.
    onSubmit: ({ value, formApi }) => {
      attachments.dismissRefused()
      if (blocked || attachments.uploading) return
      if (!value.text.trim() && attachments.parts.length === 0) return
      const parts = [
        ...attachments.parts,
        ...(value.text.trim() ? [{ $type: `${nsid.defs}#textPart`, text: value.text }] : []),
      ]
      const generation = {
        ...(value.model ? { model: value.model } : {}),
        ...(effort ? { effort } : {}),
      }
      sending.mutate({ parts, generation }, { onSuccess: () => formApi.setFieldValue('text', '') })
    },
  })
  const chosenModel = useFormStore(form.store, (state) => state.values.model)
  const chosenEffort = useFormStore(form.store, (state) => state.values.effort)
  const model = chosenModel && models.find((m) => sameModel(m, chosenModel))
  // With the fallback model, the server checks vision when the turn starts. A chosen model no
  // longer on offer takes no images, as nothing says it can read them.
  const seesImages = chosenModel ? Boolean(model?.capabilities.vision) : true
  const attachments = useAttachments(seesImages)
  const reasons = Boolean(model?.capabilities.reasoning)
  // Effort is sent only while its select is shown, so switching models back keeps the choice.
  const effort = reasons ? chosenEffort : ''
  // Without a fallback model, the server has nothing to run the turn with.
  const needsModel = !chosenModel && fallback === null
  const blocked = noModels || needsModel
  const types = useQuery(attachmentTypesQuery)
  const error =
    attachments.refused ??
    lastError(attachments.upload, sending) ??
    (types.error && `Could not load the attachment types: ${messageOf(types.error)}`)

  return (
    <form.AppForm>
      <form.Form className="composer">
        <form.AppField name="text">
          {(field) => (
            <field.TextAreaField
              aria-label="Message"
              placeholder="Message"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void form.handleSubmit()
                }
              }}
            />
          )}
        </form.AppField>
        <div>
          <ModelPicker
            models={models}
            fallback={fallback}
            model={chosenModel}
            onModelChange={(next) => form.setFieldValue('model', next)}
            reasons={reasons}
            effort={chosenEffort}
            onEffortChange={(next) => form.setFieldValue('effort', next)}
          />
          <input
            aria-label="Attach"
            type="file"
            multiple
            accept={types.data && acceptedTypes(types.data, seesImages)}
            onChange={(e) => attachments.attach(e.target.files)}
          />
          {attachments.uploading && <span>Uploading...</span>}
          {attachments.parts.map((part) => (
            <span key={blobCid(part)}>{(part.name as string | undefined) ?? 'Image'}</span>
          ))}
          <button type="submit" disabled={blocked || attachments.uploading}>
            Send
          </button>
          {props.onCancel && (
            <button type="button" onClick={props.onCancel}>
              Cancel
            </button>
          )}
        </div>
        <ModelNotice noModels={noModels} needsModel={needsModel} />
        <ErrorAlert error={error} />
      </form.Form>
    </form.AppForm>
  )
}

interface ModelNoticeProps {
  noModels: boolean
  needsModel: boolean
}

/** Why the composer can't send yet, for want of a model. */
function ModelNotice(props: ModelNoticeProps) {
  if (props.noModels)
    return (
      <p>
        No models are available to you. Add your own API key in{' '}
        <Link to="/settings/api-keys">Settings</Link>.
      </p>
    )
  if (props.needsModel) return <p>Choose a model, or set a default model in Settings.</p>
  return null
}
