import { Link } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  type Ref,
  type RefObject,
  use,
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
import { useAutoGrow } from '../hooks/useAutoGrow.ts'
import { type Blocked, type DraftOptions, useDraft } from '../hooks/useDraft.ts'
import { restoreText, takeText } from '../lib/composer-handoff.ts'
import { AttachmentChips, removeChip } from './AttachmentChips.tsx'
import {
  AttachButton,
  ClearButton,
  ComposerDock,
  composerPart,
  MessageBox,
  SendButton,
} from './composer-parts.tsx'

/*
 * The composer's parts, each reading the draft from the composer it is in, so a composer is the
 * parts it shows, in order. Imported together, as `import * as Composer`, and composed by
 * ReplyComposer and EditComposer:
 *
 *   const composer = Composer.useComposer(options, ref)
 *   <Composer.Provider value={composer}>
 *     <Composer.Form>
 *       <Composer.Card>
 *         <Composer.Input placeholder="Reply" />
 *         <Composer.Toolbar>
 *           <Composer.Attach />
 *           <Composer.Send />
 *         </Composer.Toolbar>
 *       </Composer.Card>
 *     </Composer.Form>
 *   </Composer.Provider>
 */

export {
  ComposerCard as Card,
  ComposerToolbar as Toolbar,
  StopButton as Stop,
} from './composer-parts.tsx'

/** What the conversation can do to the composer from outside it. */
export interface ComposerHandle {
  /** Add text as a quote the message will open with, shown as a chip, and focus the box. */
  quote: (text: string) => void
  /** Start the message with text, such as an example prompt, and focus the box. */
  fill: (text: string) => void
  /** Attach files, such as ones dropped on the conversation. */
  attach: (files: File[]) => void
}

/** What a composer's parts share: the draft, and the box it is typed into. */
export interface ComposerState {
  draft: ReturnType<typeof useDraft>
  box: RefObject<HTMLTextAreaElement | null>
  /** Focus the box with the cursor at the end, once new text has rendered. */
  focusEnd: () => void
}

const ComposerContext = createContext<ComposerState | null>(null)

function useComposerState(): ComposerState {
  const composer = use(ComposerContext)
  if (!composer) throw new Error('A composer part needs a Composer.Provider around it')
  return composer
}

/** A composer's draft and box, for its parts, and what the conversation can do to it through `ref`. */
export function useComposer(options: DraftOptions, ref?: Ref<ComposerHandle>): ComposerState {
  const box = useRef<HTMLTextAreaElement>(null)
  const draft = useDraft(options)
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
  return { draft, box, focusEnd }
}

/**
 * Carry over what was typed into the composer's frame before this composer took its place, with
 * its cursor and focus. A frame only stands in for a composer that starts empty.
 */
export function useFrameHandoff(composer: ComposerState) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on taking the frame's place.
  useLayoutEffect(() => {
    const left = takeText()
    if (!left || !composer.box.current) return
    composer.draft.setText(left.text)
    restoreText(composer.box.current, left)
  }, [])
}

interface ProviderProps {
  value: ComposerState
  children: ReactNode
}

export function Provider(props: ProviderProps) {
  const form = props.value.draft.form
  return (
    <ComposerContext value={props.value}>
      <form.AppForm>{props.children}</form.AppForm>
    </ComposerContext>
  )
}

interface ChildrenProps {
  children: ReactNode
}

/** The composer floating at the bottom of the panel, which sends the draft when submitted. */
export function Form(props: ChildrenProps) {
  const { draft } = useComposerState()
  return (
    <ComposerDock
      onSubmit={(e) => {
        e.preventDefault()
        draft.send()
      }}
    >
      {props.children}
    </ComposerDock>
  )
}

interface EditingNoteProps {
  onCancel: () => void
}

/** That the composer is editing an earlier message, above the box, with a way back. */
export function EditingNote(props: EditingNoteProps) {
  return (
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
  )
}

/** The draft's quotes, each a well across the card like a sent quote, cut to two lines. */
export function Quotes() {
  const { draft } = useComposerState()
  if (draft.quotes.length === 0) return null
  return (
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
  )
}

/** The draft's attachments, as chips. */
export function Attachments() {
  const { draft } = useComposerState()
  return (
    <AttachmentChips
      attachments={draft.attachments}
      onRemove={draft.removeAttachment}
      className={cn(composerPart, 'px-2.75 pt-2.5 pb-0.5')}
    />
  )
}

interface InputProps {
  placeholder: string
  /** What Escape in the box does, such as stop editing. */
  onEscape?: () => void
}

/** The message box, where Enter sends, except on a touch screen, and pasted files attach. */
export function Input(props: InputProps) {
  const { draft, box } = useComposerState()
  return (
    <draft.form.AppField name="text">
      {(field) => (
        <>
          <AutoGrow box={box} text={field.state.value} />
          <MessageBox
            ref={box}
            name={field.name}
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            placeholder={props.placeholder}
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
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touchOnly()) {
                e.preventDefault()
                draft.send()
              } else if (e.key === 'Escape' && props.onEscape) {
                e.preventDefault()
                props.onEscape()
              }
            }}
          />
        </>
      )}
    </draft.form.AppField>
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

/** Clear, while there is something to clear, which starts the message over and goes back to the box. */
export function Clear() {
  const { draft, focusEnd } = useComposerState()
  if (draft.empty) return null
  return (
    <ClearButton
      disabled={draft.sending}
      onClick={() => {
        draft.clear()
        focusEnd()
      }}
    />
  )
}

/** Attach, which opens the file picker for the types the draft takes. */
export function Attach() {
  const { draft } = useComposerState()
  const picker = useRef<HTMLInputElement>(null)
  return (
    <>
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
          // The chosen files show as attachments, and clearing lets the same file be chosen again.
          e.target.value = ''
        }}
      />
    </>
  )
}

/** The model the message asks for. */
export function Model() {
  const { draft } = useComposerState()
  return (
    <ModelSelect
      aria-label="Model"
      quiet
      loading={draft.loading}
      models={draft.models}
      value={draft.selected}
      onChange={(next) => draft.form.setFieldValue('model', next)}
      title="Model"
      none={draft.defaultOption}
    />
  )
}

/** The thinking effort, when the answering model reasons, remembered for the next message. */
export function Effort() {
  const { draft } = useComposerState()
  if (!draft.reasons) return null
  return (
    <EffortSelect
      aria-label="Thinking effort"
      quiet
      value={draft.chosenEffort}
      onChange={(next) => {
        draft.form.setFieldValue('effort', next)
        rememberEffort(next)
      }}
      auto={{ label: 'Default', detail: 'As set in Preferences' }}
    />
  )
}

interface SendProps {
  title?: string
}

/** Send, waiting until the draft can be sent. */
export function Send(props: SendProps) {
  const { draft } = useComposerState()
  return <SendButton title={props.title ?? 'Send'} disabled={!draft.canSend} />
}

/** Under the box: why the draft can't be sent yet, and why the last send or file failed. */
export function Notices() {
  const { draft } = useComposerState()
  return (
    <>
      <ModelNotice blocked={draft.blocked} />
      <ErrorAlert error={draft.error} className="mx-2 mt-2.5 text-small" />
    </>
  )
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
