import type { ModelRef } from '@scn-chat/lexicons'
import { Link } from '@tanstack/react-router'
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { CloseIcon, PencilIcon } from '../../../shared/icons.tsx'
import { touchOnly } from '../../../shared/touch.ts'
import { Button } from '../../../shared/ui/Button.tsx'
import { EffortSelect } from '../../models/components/EffortSelect.tsx'
import { ModelSelect } from '../../models/components/ModelSelect.tsx'
import { rememberEffort } from '../../models/last-effort.ts'
import type { OutgoingMessage } from '../chat.ts'
import { useAutoGrow } from '../hooks/useAutoGrow.ts'
import { type Blocked, useDraft } from '../hooks/useDraft.ts'
import { restoreText, takeText } from '../lib/composer-handoff.ts'
import { AttachmentChips, removeChip } from './AttachmentChips.tsx'
import {
  AttachButton,
  ClearButton,
  ComposerCard,
  ComposerDock,
  ComposerToolbar,
  composerPart,
  MessageBox,
  messagePlaceholder,
  SendButton,
  StopButton,
} from './composer-parts.tsx'

export interface ComposerProps {
  /** Send the message, which the composer clears once this resolves. */
  send: (message: OutgoingMessage) => Promise<unknown>
  /** The message this one answers, if any. */
  parent?: string
  /**
   * Whether the chat's messages are still on their way, so it isn't known yet whether the message
   * starts the chat or replies. The box says neither, and nothing sends until they arrive.
   */
  waiting?: boolean
  /** The model last used at or above `parent`, which the server falls back to. */
  inherited?: ModelRef | null
  initialText?: string
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
  const draft = useDraft({
    send: props.send,
    parent: props.parent,
    inherited: props.inherited,
    waiting: props.waiting,
    running: Boolean(props.onStop),
    initialText: props.initialText,
  })
  const form = draft.form
  // What was typed into the composer's frame, before this took its place, carries over with its
  // cursor and focus. A frame only stands in for a composer that starts empty, so one editing a
  // message leaves the draft be.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on taking the frame's place.
  useLayoutEffect(() => {
    if (props.onCancel || props.initialText) return
    const left = takeText()
    if (!left || !box.current) return
    draft.setText(left.text)
    restoreText(box.current, left)
  }, [])

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
      draft.quote(quoted)
      focusEnd()
    },
    fill: (filled) => {
      draft.setText(filled)
      focusEnd()
    },
    attach: (files) => draft.attach(files),
  }))
  /** Start the message over, and go back to the box. */
  const clear = () => {
    draft.clear()
    focusEnd()
  }
  return (
    <form.AppForm>
      <ComposerDock
        onSubmit={(e) => {
          e.preventDefault()
          draft.send()
        }}
      >
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
        <ComposerCard>
          {draft.quotes.length > 0 && (
            // A quote shows as a well across the card, like a sent quote, cut to two lines.
            <ul
              aria-label="Quotes"
              className={cn(composerPart, 'flex flex-col gap-1.5 px-2.75 pt-2.5 pb-0.5')}
            >
              {draft.quotes.map((quote) => (
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
                    onClick={() => draft.removeQuote(quote)}
                    className={removeChip}
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AttachmentChips
            attachments={draft.attachments}
            onRemove={draft.removeAttachment}
            className={cn(composerPart, 'px-2.75 pt-2.5 pb-0.5')}
          />
          <form.AppField name="text">
            {(field) => (
              <>
                <AutoGrow box={box} text={field.state.value} />
                <MessageBox
                  ref={box}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder={messagePlaceholder(props)}
                  onPaste={(e) => {
                    // Copied text can carry a picture of itself, as from an office app, so it pastes
                    // as text.
                    const files = Array.from(e.clipboardData.files)
                    if (files.length === 0 || e.clipboardData.types.includes('text/plain')) return
                    e.preventDefault()
                    draft.attach(files)
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
                      draft.send()
                    } else if (e.key === 'Escape' && props.onCancel) {
                      e.preventDefault()
                      props.onCancel()
                    }
                  }}
                />
              </>
            )}
          </form.AppField>
          {!draft.empty && <ClearButton disabled={draft.sending} onClick={clear} />}
          <ComposerToolbar>
            <AttachButton
              title={draft.seesImages ? 'Attach files or images' : 'Attach files'}
              onClick={() => picker.current?.click()}
            />
            <input
              ref={picker}
              aria-label="Files to attach"
              type="file"
              hidden
              multiple
              accept={draft.accept ?? undefined}
              onChange={(e) => {
                draft.attach(Array.from(e.target.files ?? []))
                // The chosen files show as attachments, and clearing lets the same file be chosen
                // again.
                e.target.value = ''
              }}
            />
            <ModelSelect
              aria-label="Model"
              quiet
              loading={draft.loading}
              models={draft.models}
              value={draft.selected}
              onChange={(next) => form.setFieldValue('model', next)}
              title="Model"
              none={draft.defaultOption}
            />
            {draft.reasons && (
              <EffortSelect
                aria-label="Thinking effort"
                quiet
                value={draft.chosenEffort}
                onChange={(next) => {
                  form.setFieldValue('effort', next)
                  rememberEffort(next)
                }}
                auto={{ label: 'Default', detail: 'As set in Preferences' }}
              />
            )}
            {props.onStop ? (
              <StopButton onClick={props.onStop} />
            ) : (
              <SendButton
                title={props.onCancel ? 'Send as a new version' : 'Send'}
                disabled={!draft.canSend}
              />
            )}
          </ComposerToolbar>
        </ComposerCard>
        <ModelNotice blocked={draft.blocked} />
        <ErrorAlert error={draft.error} className="mx-2 mt-2.5 text-small" />
      </ComposerDock>
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
  blocked: Blocked | null
}

/** Why the composer can't send yet, for want of a model that can take the message. */
function ModelNotice(props: ModelNoticeProps) {
  const className = 'mx-2 mt-2.5 text-muted text-small'
  if (props.blocked === 'noModels')
    return (
      <p className={className}>
        No models are available to you. Add a key of your own in{' '}
        <Link to="/settings/api-keys">API keys</Link>.
      </p>
    )
  if (props.blocked === 'needsModel')
    return (
      <p className={className}>
        Choose a model, or set a default model in <Link to="/settings">Preferences</Link>.
      </p>
    )
  if (props.blocked === 'images')
    return (
      <p className={className}>
        This model can't read images. Remove the image, or choose a model that can.
      </p>
    )
  return null
}
