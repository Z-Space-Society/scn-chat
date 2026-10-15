import { type ReactNode, useId, useState } from 'react'
import { stepsOf } from '../../../parts/steps.ts'
import type { BlobUrl, Part } from '../../../parts/types.ts'
import { WorkButton, WorkList } from '../../../parts/WorkSteps.tsx'
import { cn } from '../../../shared/cn.ts'
import { WaitingAuthor } from './LiveAuthor.tsx'
import { PartsView } from './PartsView.tsx'
import { SiblingPicker, type Siblings } from './SiblingPicker.tsx'
import { Status } from './Status.tsx'

export interface MessageViewProps {
  id?: string
  /** The message's record key, which its steps' times are kept by. */
  rkey?: string
  record: Record<string, unknown>
  /** What a pending reply shows as it streams, such as its stream. */
  pending?: ReactNode
  /** What a pending reply's header shows in place of its author, such as its live status. */
  live?: ReactNode
  blobUrl: BlobUrl
  siblings?: Siblings
  actions?: ReactNode
  /** What a failed reply offers beside its error, such as a button to try again. */
  retry?: ReactNode
  /** Whether the message arrived while the chat was open, rather than being there when it opened. */
  arrived?: boolean
}

type ModelRef = { provider: string; id: string }

/** Who wrote a message: the user, or the model that wrote the reply. */
function author(record: Record<string, unknown>): string {
  if (record.role === 'user') return 'You'
  return (record.model as ModelRef | undefined)?.id ?? 'Assistant'
}

interface AuthorProps {
  record: Record<string, unknown>
  live?: ReactNode
}

/** Who wrote the message, or for a pending reply, its live status. */
function Author(props: AuthorProps) {
  if (props.record.status !== 'pending') return <strong>{author(props.record)}</strong>
  if (props.live) return props.live
  return <WaitingAuthor model={author(props.record)} since={props.record.createdAt} />
}

/**
 * One message: its parts, its state, sibling controls, actions, and the work behind it. The
 * user's are bubbles on the right, and the model's are text on the panel under its name. A message
 * of yours after a reply starts a new turn, a much larger gap than the one inside a turn, and one
 * that arrives while the chat is open fades in where it lands.
 */
export function MessageView(props: MessageViewProps) {
  const record = props.record
  const content = record.content as { $type: string; parts?: Part[] }
  const parts = content.parts ?? []
  const encrypted = content.$type.endsWith('#encryptedContent')
  const steps = record.status === 'pending' ? [] : stepsOf(parts)
  const user = record.role === 'user'
  const workId = useId()
  const [workOpen, setWorkOpen] = useState(false)
  return (
    <article
      id={props.id}
      data-role={user ? 'user' : 'assistant'}
      data-status={(record.status as string | undefined) ?? undefined}
      data-arrived={props.arrived || undefined}
      className={cn(
        'group/message mt-within first-of-type:mt-5.5 data-arrived:animate-fade-in motion-reduce:animate-none',
        user &&
          'flex max-w-39/50 flex-col items-end self-end max-wide:max-w-23/25 [[data-role=assistant]+&]:mt-turn',
      )}
    >
      <header
        className={cn(
          'mb-0.75 flex items-center gap-2 text-caption text-muted',
          // The model's name, faint, after a quiet dot that breathes in green while it replies and
          // turns red when it failed.
          '[&>strong]:inline-flex [&>strong]:items-center [&>strong]:gap-1.75 [&>strong]:font-medium [&>strong]:text-caption [&>strong]:text-muted-quiet',
          user
            ? '[&>strong]:hidden'
            : "[&>strong]:before:size-1.75 [&>strong]:before:rounded-full [&>strong]:before:bg-author-dot [&>strong]:before:content-['']",
          record.status === 'pending' &&
            '[&>strong]:before:animate-breathe [&>strong]:before:bg-accent-mark motion-reduce:[&>strong]:before:animate-none',
          record.status === 'error' && '[&>strong]:before:bg-danger',
        )}
      >
        <Author record={record} live={props.live} />
        {props.siblings && props.siblings.count > 1 && <SiblingPicker siblings={props.siblings} />}
      </header>
      <PartsView parts={parts} record={record} blobUrl={props.blobUrl} scope={props.rkey} />
      {record.status === 'pending' && props.pending}
      {encrypted && <p>This message is encrypted.</p>}
      <Status record={record} retry={props.retry} />
      {/* The actions sit by the message's edge, a reply's at the start and the user's at the end,
          and a reply's steps button comes after them. They stay quiet until the message is
          hovered or focused, except the latest reply's, which are the ones most often wanted next,
          and on a touch screen, which has no hover to reveal them. */}
      <footer
        className={cn(
          'mt-1.5 flex flex-wrap items-center gap-0.5 opacity-0 touch:opacity-100 transition-opacity duration-(--dur-feedback) focus-within:opacity-100 group-hover/message:opacity-100 has-[[aria-expanded=true]]:opacity-100',
          user ? '-me-2 justify-end' : '-ms-2 group-last-of-type/message:opacity-100',
        )}
      >
        {props.actions && (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form fields, not a row of buttons.
          <span
            role="group"
            aria-label="Message actions"
            className="inline-flex items-center gap-0.5"
          >
            {props.actions}
          </span>
        )}
        {steps.length > 0 && (
          <WorkButton
            steps={steps}
            scope={props.rkey}
            open={workOpen}
            controls={workId}
            onToggle={() => setWorkOpen(!workOpen)}
          />
        )}
      </footer>
      {workOpen && steps.length > 0 && (
        <WorkList
          id={workId}
          steps={steps}
          record={record}
          blobUrl={props.blobUrl}
          scope={props.rkey}
        />
      )}
    </article>
  )
}
