import type { ModelRef } from '@scn-chat/lexicons'
import { nsid } from '@scn-chat/lexicons/nsid'
import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { messageOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { CloseIcon, PaperclipIcon, PencilIcon, SendIcon, StopIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { conversationRefreshKey } from '../../../store/react.tsx'
import { EffortSelect } from '../../models/components/EffortSelect.tsx'
import { ModelSelect } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { lastEffort, rememberEffort } from '../../models/last-effort.ts'
import { sameModel } from '../../models/models.ts'
import { attachmentTypesQuery } from '../attachment-types.ts'
import { useAttachments } from '../hooks/useAttachments.ts'
import { useAutoGrow } from '../hooks/useAutoGrow.ts'
import { AttachmentChips, removeChip } from './AttachmentChips.tsx'

export interface ComposerProps {
  /** The chat to send to. Without one, sending the first message creates the chat. */
  skey?: string
  parent?: string
  /** The model of the nearest completed reply above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  initialText?: string
  onSent: (sent: { skey: string; rkey: string; replyRkey: string | null }) => void
  /** Stop editing an earlier message, offered by the note that says the composer is editing, and on Escape. */
  onCancel?: () => void
  /** Stop the reply running at the end of the branch, offered in place of Send until it ends. */
  onStop?: () => void
  /** What floats just above the box, such as a button that jumps to the latest message. */
  above?: ReactNode
  ref?: Ref<ComposerHandle>
}

/** What the conversation can do to the composer from outside it. */
export interface ComposerHandle {
  /** Add text as a quote the message will open with, shown as a chip, and focus the box. */
  quote: (text: string) => void
  /** Start the message with text, such as an example prompt, and focus the box. */
  fill: (text: string) => void
  /** Attach files, such as ones dropped on the conversation. */
  attach: (files: File[]) => void
}

interface Draft {
  text: string
  /** The chosen model by reference, so its capabilities come from the current catalog. */
  model: ModelRef | null
  effort: string
}

/** A passage quoted from a reply, held apart from the draft until the message is sent. */
type Quote = { id: string; text: string }

/** Text as a Markdown block quote, followed by a blank line to write under it. */
const asQuote = (text: string) =>
  `${text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n\n`

/** What the attach button takes: any type an ingester reads, and images when the model sees them. */
const acceptedTypes = (types: { images: string[]; files: string[] }, images: boolean) =>
  [...(images ? types.images : []), ...types.files].join(',')

/** A device that can't hover, like a phone, whose on-screen Enter is for new lines. */
const touchOnly = () => window.matchMedia?.('(hover: none)').matches === true

/** A round button at the toolbar's end or start, nesting in the composer's corner. */
const round = 'inline-grid size-composer-button flex-none place-items-center rounded-full p-0'

/**
 * The message box: one white card floating at the bottom of the panel, over the conversation fading
 * under it, with quotes and attachments at its top, the text, and a toolbar of Attach, the model and
 * effort, and Send, which nests in the card's corner as the main action. While a reply runs, Stop
 * takes Send's place.
 */
// The ref is kept out of `props`: React Compiler treats an object holding a ref as one, so reading
// any other prop in render would stop it memoizing the composer.
export function Composer({ ref, ...props }: ComposerProps) {
  const box = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  /** Let go of these quotes, keeping any added while a message was on its way. */
  const dropQuotes = (dropped: Quote[]) =>
    setQuotes((current) => current.filter((quote) => !dropped.includes(quote)))
  const { models, loading: modelsLoading, fallback, noModels } = useModels(props.inherited ?? null)
  const queryClient = useQueryClient()
  // The chat created by a first message, kept so trying again after a failed send reuses it.
  const created = useRef<string | null>(null)
  /** The chat to send to, created on the first message when there is none yet. */
  const target = async () => {
    if (props.skey) return props.skey
    if (created.current === null)
      created.current = (await read(api.chats.conversations.$post())).skey
    return created.current
  }

  // This composer's sends, so the cache can tell whether one is on its way.
  const sendKey = ['send', useId()]
  const sending = useMutation({
    mutationKey: sendKey,
    mutationFn: async (draft: Draft) => {
      const attached = attachments.attachments
      const quoted = quotes
      // The quotes open the message, as Markdown, above what the user wrote.
      const quotedText = quoted.map((quote) => asQuote(quote.text)).join('')
      const message = draft.text.trim() ? quotedText + draft.text : quotedText.trimEnd()
      const parts = [
        ...attached.map((a) => a.part as Record<string, unknown>),
        ...(message ? [{ $type: `${nsid.defs}#textPart`, text: message }] : []),
      ]
      const generation = {
        ...(draft.model ? { model: draft.model } : {}),
        ...(effort ? { effort } : {}),
      }
      const skey = await target()
      const sent = await read(
        api.turns.conversations[':skey'].messages.$post(
          { param: { skey } },
          json({ parent: props.parent, parts, generation }),
        ),
      )
      form.setFieldValue('text', '')
      dropQuotes(quoted)
      attachments.drop(attached)
      props.onSent({ skey, rkey: sent.rkey, replyRkey: sent.replyRkey })
      return skey
    },
    // Refreshing picks up the sent message without waiting for the stream.
    onSuccess: (skey) => queryClient.invalidateQueries({ queryKey: conversationRefreshKey(skey) }),
  })
  const form = useAppForm({
    // The effort starts where the last message on this device left it.
    defaultValues: { text: props.initialText ?? '', model: null, effort: lastEffort() } as Draft,
    // What the chosen model allows and the attachments depend on the form's values, so they come
    // below, and submitting reads them as they are when it runs.
    onSubmit: ({ value }) => {
      // A second Enter while the message is on its way would send it again, and while a reply
      // runs there is nothing finished to answer. The cache knows of a send at once, before the
      // composer rerenders, so a second Enter right after the first is caught too.
      const onItsWay = queryClient.isMutating({ mutationKey: sendKey }) > 0
      if (onItsWay || props.onStop || blocked || attachments.uploading || empty) return
      attachments.clearError()
      sending.mutate(value)
    },
  })
  // Only whether there is text, so typing rerenders the box rather than the whole composer.
  const hasText = useFormStore(form.store, (state) => state.values.text.trim() !== '')
  const chosenModel = useFormStore(form.store, (state) => state.values.model)
  const chosenEffort = useFormStore(form.store, (state) => state.values.effort)
  const model = chosenModel && models.find((m) => sameModel(m, chosenModel))
  // With the fallback model, the server checks vision when the turn starts. A chosen model no
  // longer on offer takes no images, as nothing says it can read them.
  const seesImages = chosenModel ? Boolean(model?.capabilities.vision) : true
  const attachments = useAttachments(seesImages)
  const reasons = Boolean(model?.capabilities.reasoning)
  // Effort is sent only while its choice is shown, so switching models back keeps it.
  const effort = reasons ? chosenEffort : ''
  // Without a fallback model, the server has nothing to run the turn with.
  const needsModel = !chosenModel && fallback === null
  // "Default" names the model the server will fall back to, so the user sees who will answer.
  const fallbackName = fallback && models.find((m) => sameModel(m, fallback))?.name
  const blocked = noModels || needsModel
  // Nothing to send: no text but spaces, no quotes, and no attachments.
  const empty = !hasText && quotes.length === 0 && attachments.attachments.length === 0
  const { data: types, error: typesError } = useQuery(attachmentTypesQuery)
  const accept = types && acceptedTypes(types, seesImages)

  /** Focus the box with the cursor at the end, once the new text has rendered. */
  const focusEnd = () =>
    requestAnimationFrame(() => {
      const element = box.current
      if (!element) return
      element.focus()
      element.setSelectionRange(element.value.length, element.value.length)
    })
  useImperativeHandle(ref, () => ({
    quote: (quoted) => {
      if (quoted.trim())
        setQuotes((current) => [...current, { id: crypto.randomUUID(), text: quoted }])
      focusEnd()
    },
    fill: (filled) => {
      form.setFieldValue('text', filled)
      focusEnd()
    },
    attach: (files) => attachments.add(files),
  }))
  /** Start the message over: no text, quotes, or attachments, and no error from the last try. */
  const clear = () => {
    form.setFieldValue('text', '')
    setQuotes([])
    attachments.drop(attachments.attachments)
    attachments.clearError()
    sending.reset()
    focusEnd()
  }
  const error =
    attachments.error ??
    (sending.error && messageOf(sending.error)) ??
    (typesError && "Couldn't load which files you can attach. Reload the page to try again.")
  // The box's parts share one card: the first takes its top corners, and only the box's edge
  // firms while it is being typed in.
  const part =
    'border-x border-line bg-raised group-focus-within/composer:border-line-strong in-data-dropping:border-dashed in-data-dropping:border-accent'

  return (
    <form.AppForm>
      <form.Form className="group/composer sticky bottom-0 isolate mt-auto pt-6 pb-4.5 before:absolute before:-inset-x-gutter before:inset-y-0 before:-z-1 before:bg-panel before:[mask-image:linear-gradient(transparent,black_--spacing(6))]">
        {props.above}
        {props.onCancel && (
          // Editing an earlier message says so above the box, with a way back.
          <div className="mx-1.5 mb-2 flex items-center gap-1.75 text-caption text-muted">
            <PencilIcon className="size-3.75" />
            <span>Editing your message. Sending adds it as a new version.</span>
            <Button
              size="small"
              title="Stop editing (Esc)"
              onClick={props.onCancel}
              className="ms-auto px-2.5 py-0.5 text-caption"
            >
              Cancel
            </Button>
          </div>
        )}
        <div className="relative [&>:first-child]:rounded-t-composer [&>:first-child]:border-t has-[>[data-clear]]:[&>:first-child]:pe-[calc(var(--spacing-composer-button)+--spacing(3.5))]">
          {quotes.length > 0 && (
            // A quote shows as a well across the card, like a sent quote, cut to two lines.
            <ul
              aria-label="Quotes"
              className={cn(part, 'flex flex-col gap-1.5 px-2.75 pt-2.5 pb-0.5')}
            >
              {quotes.map((quote) => (
                <li
                  key={quote.id}
                  title={quote.text}
                  className="flex w-full items-start gap-2 rounded-quote bg-well py-1.5 ps-2.75 pe-1 text-caption"
                >
                  <blockquote className="line-clamp-2 flex-1 text-muted">
                    {quote.text.trim().replace(/\s+/g, ' ')}
                  </blockquote>
                  <button
                    type="button"
                    aria-label="Remove quote"
                    onClick={() => dropQuotes([quote])}
                    className={removeChip}
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AttachmentChips
            attachments={attachments.attachments}
            onRemove={(attachment) => attachments.drop([attachment])}
            className={cn(part, 'px-2.75 pt-2.5 pb-0.5')}
          />
          <form.AppField name="text">
            {(field) => (
              <>
                <AutoGrow box={box} text={field.state.value} />
                <field.TextAreaField
                  ref={box}
                  aria-label="Message"
                  dir="auto"
                  placeholder={props.parent ? 'Reply' : 'Ask anything'}
                  onPaste={(e) => {
                    // Copied text can carry a picture of itself, as from an office app, so it pastes
                    // as text.
                    const files = Array.from(e.clipboardData.files)
                    if (files.length === 0 || e.clipboardData.types.includes('text/plain')) return
                    e.preventDefault()
                    attachments.add(files)
                  }}
                  onKeyDown={(e) => {
                    // Enter while an input method composes, as for Japanese, picks the words instead.
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      !touchOnly()
                    ) {
                      e.preventDefault()
                      void form.handleSubmit()
                    } else if (e.key === 'Escape' && props.onCancel) {
                      e.preventDefault()
                      props.onCancel()
                    }
                  }}
                  className={cn(
                    part,
                    'block max-h-composer-max min-h-13.5 w-full resize-none rounded-none border-y-0 px-4.5 pt-3.5 pb-1.5 text-[max(var(--input-floor),var(--text-body))] text-ink-strong [field-sizing:content] focus-visible:border-line-strong focus-visible:ring-0',
                  )}
                />
              </>
            )}
          </form.AppField>
          {!empty && (
            // Clear sits in the box's top corner, as a field's own clear button, apart from the
            // toolbar's controls.
            <button
              type="button"
              data-clear
              aria-label="Clear"
              title="Clear the message"
              disabled={sending.isPending}
              onClick={clear}
              className={cn(
                round,
                'absolute end-2.5 top-2.5 cursor-pointer text-faint hover:not-disabled:bg-hover hover:not-disabled:text-ink',
              )}
            >
              <CloseIcon />
            </button>
          )}
          <div
            className={cn(
              part,
              'flex flex-wrap items-center gap-1.75 rounded-b-composer border-b ps-3.25 pe-2.25 pt-1.75 pb-2.25 text-small',
            )}
          >
            <button
              type="button"
              aria-label="Attach files"
              title={seesImages ? 'Attach files or images' : 'Attach files'}
              onClick={() => picker.current?.click()}
              className={cn(
                round,
                '-ms-1.5 me-auto cursor-pointer text-faint hover:bg-hover hover:text-ink',
              )}
            >
              <PaperclipIcon />
            </button>
            <input
              ref={picker}
              aria-label="Files to attach"
              type="file"
              hidden
              multiple
              accept={accept ?? undefined}
              onChange={(e) => {
                attachments.add(Array.from(e.target.files ?? []))
                // The chosen files show as attachments, and clearing lets the same file be chosen
                // again.
                e.target.value = ''
              }}
            />
            <ModelSelect
              aria-label="Model"
              quiet
              loading={modelsLoading}
              models={models}
              value={chosenModel}
              onChange={(next) => form.setFieldValue('model', next)}
              title="Model"
              none={
                fallback === null
                  ? { label: 'Choose a model', selectable: false }
                  : {
                      label: fallbackName ? `Default · ${fallbackName}` : 'Default model',
                      selectable: true,
                    }
              }
            />
            {reasons && (
              <EffortSelect
                aria-label="Thinking effort"
                quiet
                value={chosenEffort}
                onChange={(next) => {
                  form.setFieldValue('effort', next)
                  rememberEffort(next)
                }}
                auto={{ label: 'Default', detail: 'As set in Preferences' }}
              />
            )}
            {props.onStop ? (
              <Button
                tone="danger"
                aria-label="Stop"
                title="Stop the reply"
                onClick={props.onStop}
                className={round}
              >
                {/* The stop square fills most of its box, so it draws smaller to sit at the
                    arrow's weight. */}
                <StopIcon className="size-3.25" />
              </Button>
            ) : (
              <Button
                type="submit"
                aria-label="Send"
                title={props.onCancel ? 'Send as a new version' : 'Send'}
                disabled={empty || blocked || attachments.uploading || sending.isPending}
                className={round}
              >
                <SendIcon className="size-4.75" />
              </Button>
            )}
          </div>
        </div>
        <ModelNotice noModels={noModels} needsModel={needsModel} />
        <ErrorAlert error={error} className="mx-2 mt-2.5 text-small" />
      </form.Form>
    </form.AppForm>
  )
}

interface AutoGrowProps {
  box: RefObject<HTMLTextAreaElement | null>
  text: string
}

/** Grows the message box with its text where CSS can't, in the field, so typing rerenders only it. */
function AutoGrow(props: AutoGrowProps) {
  useAutoGrow(props.box, props.text)
  return null
}

interface ModelNoticeProps {
  noModels: boolean
  needsModel: boolean
}

/** Why the composer can't send yet, for want of a model. */
function ModelNotice(props: ModelNoticeProps) {
  const className = 'mx-2 mt-2.5 text-muted text-small'
  if (props.noModels)
    return (
      <p className={className}>
        No models are available to you. Add a key of your own in{' '}
        <Link to="/settings/api-keys">API keys</Link>.
      </p>
    )
  if (props.needsModel)
    return (
      <p className={className}>
        Choose a model, or set a default model in <Link to="/settings">Preferences</Link>.
      </p>
    )
  return null
}
