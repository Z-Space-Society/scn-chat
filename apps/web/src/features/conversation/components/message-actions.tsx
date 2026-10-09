import type { ModelRef } from '@scn-chat/lexicons'
import { type ComponentType, useState } from 'react'
import { ModelSelect } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import type { BranchMessage } from '../lib/branch.ts'

/** What the conversation lets an action do. */
export interface ConversationOperations {
  /** Start editing a user message, by its rkey. */
  edit: (rkey: string) => void
  /** Regenerate the reply to a user message, by the user message's rkey, with a model or the same one. */
  regenerate: (parent: string | null, model: ModelRef | null) => void
  /** Stop a pending reply, by its rkey. */
  stop: (rkey: string) => void
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

function EditAction(props: MessageActionProps) {
  if (props.message.record.role !== 'user') return null
  return (
    <button type="button" onClick={() => props.operations.edit(props.message.rkey)}>
      Edit
    </button>
  )
}

function StopAction(props: MessageActionProps) {
  if (props.message.record.role === 'user' || props.message.record.status !== 'pending') return null
  return (
    <button type="button" onClick={() => props.operations.stop(props.message.rkey)}>
      Stop
    </button>
  )
}

/** Regenerate a finished reply. */
function RegenerateAction(props: MessageActionProps) {
  const record = props.message.record
  if (record.role === 'user' || record.status === 'pending') return null
  const parent = (record.parent as string | undefined) ?? null
  return <RegenerateControl onRegenerate={(model) => props.operations.regenerate(parent, model)} />
}

interface RegenerateControlProps {
  onRegenerate: (model: ModelRef | null) => void
}

/** Regenerate with the same model, or with a model chosen for this reply. */
function RegenerateControl(props: RegenerateControlProps) {
  const { models } = useModels()
  const [model, setModel] = useState<ModelRef | null>(null)
  return (
    <>
      <ModelSelect aria-label="Regenerate with" models={models} value={model} onChange={setModel}>
        <option value="">Same model</option>
      </ModelSelect>
      <button type="button" onClick={() => props.onRegenerate(model)}>
        Regenerate
      </button>
    </>
  )
}

/** The actions under each message, in order. */
export const messageActions: MessageAction[] = [
  { id: 'edit', Action: EditAction },
  { id: 'regenerate', Action: RegenerateAction },
  { id: 'stop', Action: StopAction },
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
