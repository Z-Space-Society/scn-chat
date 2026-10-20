import type { ModelRef } from '@scn-chat/lexicons'
import { nsid } from '@scn-chat/lexicons/nsid'
import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { messageOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import type { None } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { lastEffort } from '../../models/last-effort.ts'
import { type ModelOption, modelRef, sameModel } from '../../models/models.ts'
import { attachmentTypesQuery } from '../attachment-types.ts'
import type { OutgoingMessage } from '../chat.ts'
import { type Attachment, useAttachments } from './useAttachments.ts'

export interface DraftOptions {
  /** Send the message, which the draft lets go of once this resolves. */
  send: (message: OutgoingMessage) => Promise<unknown>
  /** The message this one answers, if any. */
  parent?: string
  /** The model last used at or above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  /** Whether the chat's messages are still on their way, so nothing knows yet what this answers. */
  waiting?: boolean
  /** Whether the reply at the end of the branch is running, so there is nothing finished to answer. */
  running?: boolean
  initialText?: string
}

/** A passage quoted from a reply, held apart from the text until the message is sent. */
export type Quote = { id: string; text: string }

/** Why the draft can't be sent as it stands, until the user changes it or the model. */
export type Blocked = 'noModels' | 'needsModel' | 'images'

/** What the form holds: the text, and the model and effort chosen for it. */
interface Fields {
  text: string
  /** The chosen model by reference, so its capabilities come from the current catalog. */
  model: ModelRef | null
  effort: string
}

/** What one send takes, so it lets go of only these once the message is sent. */
interface Sending {
  message: OutgoingMessage
  quoted: Quote[]
  attached: Attachment[]
}

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

const isImage = (attachment: Attachment) => attachment.type.startsWith('image/')

/**
 * The model select's choice of no model: "Default", the default from settings, named so the user
 * sees who will answer. It is offered only before the chat has a model of its own.
 */
function defaultOption(
  inherited: ModelRef | null,
  fallback: ModelRef | null | undefined,
  models: ModelOption[],
): None | undefined {
  if (inherited) return undefined
  if (fallback === null) return { label: 'Choose a model', selectable: false }
  const name = fallback && models.find((m) => sameModel(m, fallback))?.name
  return { label: name ? `Default · ${name}` : 'Default model', selectable: true }
}

/**
 * The Draft: what the user is writing in a composer, with its quotes, attachments, model, and
 * effort, until it is sent. It holds the rules for whether it can be sent and builds the message
 * from all of them, so the composer only shows it.
 */
export function useDraft(options: DraftOptions) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  /** Let go of these quotes, keeping any added while a message was on its way. */
  const dropQuotes = (dropped: Quote[]) =>
    setQuotes((current) => current.filter((quote) => !dropped.includes(quote)))
  const { models, loading, fallback, noModels } = useModels(options.inherited ?? null)
  const queryClient = useQueryClient()
  const form = useAppForm({
    // The effort starts where the last message on this device left it.
    defaultValues: { text: options.initialText ?? '', model: null, effort: lastEffort() } as Fields,
  })

  // Only whether there is text, so typing rerenders the box rather than the whole composer.
  const hasText = useFormStore(form.store, (state) => state.values.text.trim() !== '')
  const chosenModel = useFormStore(form.store, (state) => state.values.model)
  const chosenEffort = useFormStore(form.store, (state) => state.values.effort)
  // The model that will answer: the chosen one, else the fallback, as the catalog lists it. A
  // chosen model no longer on offer has no capabilities, as nothing says what it can do.
  const model = models.find((m) => {
    const answering = chosenModel ?? fallback
    return answering && sameModel(m, answering)
  })
  // Only a fallback the catalog doesn't list leaves it to the server, which checks vision when
  // the turn starts.
  const seesImages = model ? model.capabilities.vision : !chosenModel
  // Until the chat's messages arrive, nothing says which model it uses, so no effort is offered.
  const reasons = !options.waiting && Boolean(model?.capabilities.reasoning)
  // Effort is sent only while its choice is shown, so switching models back keeps it.
  const effort = reasons ? chosenEffort : ''
  const attachments = useAttachments(seesImages)
  const { data: types, error: typesError } = useQuery(attachmentTypesQuery)

  // This draft's sends, so the cache can tell whether one is on its way.
  const sendKey = ['send', useId()]
  const sending = useMutation({
    mutationKey: sendKey,
    mutationFn: async (sent: Sending) => {
      await options.send(sent.message)
      form.setFieldValue('text', '')
      dropQuotes(sent.quoted)
      attachments.drop(sent.attached)
    },
  })

  const blocked: Blocked | null = noModels
    ? 'noModels'
    : // Without a fallback model, the server has nothing to run the turn with.
      !chosenModel && fallback === null
      ? 'needsModel'
      : // An image attached before switching to a model that can't read it.
        !seesImages && attachments.attachments.some(isImage)
        ? 'images'
        : null
  // Nothing to send: no text but spaces, no quotes, and no attachments.
  const empty = !hasText && quotes.length === 0 && attachments.attachments.length === 0
  // Send is disabled, and sending does nothing, for the same reasons, so a new reason not to send
  // goes here and nowhere else.
  const canSend = !(
    empty ||
    blocked ||
    options.waiting ||
    options.running ||
    attachments.uploading ||
    sending.isPending
  )

  /** The message as the draft stands: the quotes, as Markdown above the text, and the attachments. */
  const build = (): OutgoingMessage => {
    const values = form.state.values
    const answering = values.model ?? (fallback && modelRef(fallback))
    const quotedText = quotes.map((quote) => asQuote(quote.text)).join('')
    const text = values.text.trim() ? quotedText + values.text : quotedText.trimEnd()
    return {
      parent: options.parent,
      parts: [
        ...attachments.attachments.map((a) => a.part as Record<string, unknown>),
        ...(text ? [{ $type: `${nsid.defs}#textPart`, text }] : []),
      ],
      generation: {
        // The message names the model that answers it, even one left to the default, so the chat
        // keeps that model whatever later becomes of the default.
        ...(answering ? { model: answering } : {}),
        ...(effort ? { effort } : {}),
      },
    }
  }

  return {
    /** The form holding the text, model, and effort, for the box to bind its field to. */
    form,
    quotes,
    attachments: attachments.attachments,
    /** The models on offer. */
    models,
    /** Whether the models, or the chat's messages that say which one it uses, are on their way. */
    loading: loading || Boolean(options.waiting),
    /**
     * The model the select shows: the one chosen, else the chat's own, the one last used on the
     * branch. Null leaves the choice to the default from settings.
     */
    selected: chosenModel ?? options.inherited ?? null,
    /**
     * The select's choice of no model: the default from settings, named once the catalog offers
     * it. A chat with a model of its own offers none, so "Default" never names a model the user
     * picked for the chat.
     */
    defaultOption: defaultOption(options.inherited ?? null, fallback, models),
    chosenEffort,
    seesImages,
    /** Whether the answering model reasons, so the effort is shown and sent. */
    reasons,
    /** What the attach button takes, once the types have loaded. */
    accept: types && acceptedTypes(types, seesImages),
    empty,
    blocked,
    canSend,
    sending: sending.isPending,
    /** Why the last file or send failed, or the attachment types couldn't load. */
    error:
      attachments.error ??
      (sending.error && messageOf(sending.error)) ??
      (typesError && "Couldn't load which files you can attach. Reload the page to try again."),
    /** Send the message, unless it can't be sent now. */
    send: () => {
      // A second Enter while the message is on its way would send it again. The cache knows of a
      // send at once, before the composer rerenders, so a second Enter right after the first is
      // caught too.
      const onItsWay = queryClient.isMutating({ mutationKey: sendKey }) > 0
      if (!canSend || onItsWay) return
      attachments.clearError()
      sending.mutate({ message: build(), quoted: quotes, attached: attachments.attachments })
    },
    /** Add text as a quote the message will open with. */
    quote: (text: string) => {
      if (text.trim()) setQuotes((current) => [...current, { id: crypto.randomUUID(), text }])
    },
    removeQuote: (quote: Quote) => dropQuotes([quote]),
    /** Attach files, each uploading at once. An image is turned away when the model can't read it. */
    attach: attachments.add,
    removeAttachment: (attachment: Attachment) => attachments.drop([attachment]),
    setText: (text: string) => form.setFieldValue('text', text),
    /** Start over: no text, quotes, or attachments, and no error from the last try. */
    clear: () => {
      form.setFieldValue('text', '')
      setQuotes([])
      attachments.drop(attachments.attachments)
      attachments.clearError()
      sending.reset()
    },
  }
}
