import { type ReactNode, useId, useState } from 'react'
import { stepsOf } from '../../../parts/steps.ts'
import type { BlobUrl } from '../../../parts/types.ts'
import { WorkButton, WorkList } from '../../../parts/WorkSteps.tsx'
import { cn } from '../../../shared/cn.ts'
import {
  authorOf,
  isEncrypted,
  isPending,
  type MessageRecord,
  partsOf,
} from '../../../shared/message.ts'
import { PartsView } from './PartsView.tsx'
import { PendingAuthor, PendingBody } from './PendingReply.tsx'
import { SiblingPicker, type Siblings } from './SiblingPicker.tsx'
import { Status } from './Status.tsx'

export interface MessageViewProps {
  id?: string
  /** The message's record key, which its steps' times are kept by. */
  rkey?: string
  record: MessageRecord
  blobUrl: BlobUrl
  siblings?: Siblings
  actions?: ReactNode
  /** What a failed reply offers beside its error, such as a button to try again. */
  retry?: ReactNode
  /** Whether the message arrived while the chat was open, rather than being there when it opened. */
  arrived?: boolean
}

interface AuthorProps {
  rkey?: string
  record: MessageRecord
}

/** Who wrote the message, or for a pending reply, its live status. */
function Author(props: AuthorProps) {
  if (!isPending(props.record)) return <strong>{authorOf(props.record)}</strong>
  return (
    <PendingAuthor
      rkey={props.rkey}
      model={authorOf(props.record)}
      since={props.record.createdAt}
    />
  )
}

/**
 * One message: its parts, its state, sibling controls, actions, and the work behind it. The
 * user's are bubbles on the right, and the model's are text on the panel under its name. A message
 * of yours after a reply starts a new turn, a much larger gap than the one inside a turn, and one
 * that arrives while the chat is open fades in where it lands.
 */
export function MessageView(props: MessageViewProps) {
  const record = props.record
  const parts = partsOf(record)
  // A pending reply shows its stream until its finished record replaces it.
  const pending = isPending(record)
  const steps = pending ? [] : stepsOf(parts)
  const user = record.role === 'user'
  const workId = useId()
  const [workOpen, setWorkOpen] = useState(false)
  return (
    <article
      id={props.id}
      data-role={user ? 'user' : 'assistant'}
      data-status={record.status}
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
          pending &&
            '[&>strong]:before:animate-breathe [&>strong]:before:bg-accent-mark motion-reduce:[&>strong]:before:animate-none',
          record.status === 'error' && '[&>strong]:before:bg-danger',
        )}
      >
        <Author rkey={props.rkey} record={record} />
        {props.siblings && props.siblings.count > 1 && <SiblingPicker siblings={props.siblings} />}
      </header>
      <PartsView parts={parts} record={record} blobUrl={props.blobUrl} scope={props.rkey} />
      {pending && <PendingBody rkey={props.rkey} record={record} blobUrl={props.blobUrl} />}
      {isEncrypted(record) && <p>This message is encrypted.</p>}
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
