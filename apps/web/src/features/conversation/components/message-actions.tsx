import type { ModelRef } from '@scn-chat/lexicons'
import type { ComponentType } from 'react'
import { PencilIcon, RetryIcon } from '../../../shared/icons.tsx'
import { action, iconAction } from '../../../shared/ui/actions.ts'
import { CopyButton } from '../../../shared/ui/CopyButton.tsx'
import { messageText } from '../../../store/core.ts'
import type { ModelOption } from '../../models/models.ts'
import type { BranchMessage } from '../lib/branch.ts'
import { MoreActions } from './MoreActions.tsx'
import { DetailsButton, recordRows } from './RecordDetails.tsx'

/** What the conversation lets an action do. */
export interface ConversationOperations {
  /** Start editing a user message, by its rkey. */
  edit: (rkey: string) => void
  /** Regenerate the reply to a user message, by the user message's rkey, with a model or the same one. */
  regenerate: (parent: string | null, model: ModelRef | null) => void
  /** Stop a pending reply, by its rkey. */
  stop: (rkey: string) => void
  /** The models a reply can be regenerated with. */
  models: ModelOption[]
  /** Where the conversation's records live, for their details. */
  storedIn: string
  /** Quote text into the composer. */
  quote?: (text: string) => void
  /** The reply running at the end of the branch, which the composer offers to stop instead. */
  running?: string | null
}

export interface MessageActionProps {
  message: BranchMessage
  operations: ConversationOperations
}

/** A control under a message, which renders nothing for a message it doesn't apply to. */
export interface MessageAction {
  id: string
  Action: ComponentType<MessageActionProps>
}

const isUser = (message: BranchMessage) => message.record.role === 'user'
const isPending = (message: BranchMessage) => message.record.status === 'pending'
const parentOf = (message: BranchMessage) => (message.record.parent as string | undefined) ?? null
const rowsOf = (props: MessageActionProps) =>
  recordRows({
    rkey: props.message.rkey,
    record: props.message.record,
    storedIn: props.operations.storedIn,
  })

function EditAction(props: MessageActionProps) {
  if (!isUser(props.message)) return null
  return (
    <button
      type="button"
      aria-label="Edit message"
      title="Edit message"
      onClick={() => props.operations.edit(props.message.rkey)}
      className={iconAction}
    >
      <PencilIcon />
    </button>
  )
}

function CopyAction(props: MessageActionProps) {
  if (isPending(props.message)) return null
  return <CopyButton text={messageText(props.message.record)} icon className={iconAction} />
}

/** Regenerate a finished reply with the same model. */
function RegenerateAction(props: MessageActionProps) {
  if (isUser(props.message) || isPending(props.message)) return null
  return (
    <button
      type="button"
      aria-label="Regenerate"
      title="Regenerate"
      onClick={() => props.operations.regenerate(parentOf(props.message), null)}
      className={iconAction}
    >
      <RetryIcon />
    </button>
  )
}

function StopAction(props: MessageActionProps) {
  if (isUser(props.message) || !isPending(props.message)) return null
  if (props.message.rkey === props.operations.running) return null
  return (
    <button
      type="button"
      onClick={() => props.operations.stop(props.message.rkey)}
      className={action}
    >
      Stop
    </button>
  )
}

/** A user message's details, as a card by the button. */
function DetailsAction(props: MessageActionProps) {
  if (!isUser(props.message)) return null
  return <DetailsButton rows={rowsOf(props)} />
}

/** A finished reply's quote, regenerate with another model, and details. */
function MoreAction(props: MessageActionProps) {
  if (isUser(props.message) || isPending(props.message)) return null
  return (
    <MoreActions
      elementId={`m-${props.message.rkey}`}
      text={messageText(props.message.record)}
      onQuote={props.operations.quote}
      models={props.operations.models}
      onRegenerate={(model) => props.operations.regenerate(parentOf(props.message), model)}
      rows={rowsOf(props)}
    />
  )
}

/**
 * The actions under each message, in order: icons named by their labels, sitting at the message's
 * edge with the most used nearest it. A user message gets edit, copy, and details, a finished reply
 * copy, regenerate, and More, and a pending reply Stop.
 */
export const messageActions: MessageAction[] = [
  { id: 'edit', Action: EditAction },
  { id: 'copy', Action: CopyAction },
  { id: 'regenerate', Action: RegenerateAction },
  { id: 'stop', Action: StopAction },
  { id: 'details', Action: DetailsAction },
  { id: 'more', Action: MoreAction },
]

/** Every action that applies to a message. */
export function MessageActions(props: MessageActionProps) {
  return (
    <>
      {messageActions.map(({ id, Action }) => (
        <Action key={id} message={props.message} operations={props.operations} />
      ))}
    </>
  )
}
