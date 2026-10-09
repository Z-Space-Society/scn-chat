import type { ReactNode } from 'react'
import { viewFor } from '../../../parts/index.ts'
import {
  type BlobRef,
  type BlobUrl,
  kind,
  type Part,
  type PartViewProps,
} from '../../../parts/types.ts'
import { SiblingPicker, type Siblings } from './SiblingPicker.tsx'
import { Status } from './Status.tsx'

export interface MessageViewProps {
  id?: string
  record: Record<string, unknown>
  /** What a pending reply shows in place of "Thinking...", such as its stream. */
  pending?: ReactNode
  blobUrl: BlobUrl
  siblings?: Siblings
  actions?: ReactNode
}

/** What tells a part apart within its message, since only tool parts carry an id. */
function partIdentity(part: Part): string {
  const blob = (part.image ?? part.file) as BlobRef | undefined
  return `${part.$type}:${(part.callId ?? blob?.ref.$link ?? part.url ?? part.text ?? '') as string}`
}

/** A message's parts with stable keys, counting repeats of the same identity. */
function withKeys(parts: Part[]): { part: Part; key: string }[] {
  const seen = new Map<string, number>()
  return parts.map((part) => {
    const identity = partIdentity(part)
    const count = seen.get(identity) ?? 0
    seen.set(identity, count + 1)
    return { part, key: `${identity}#${count}` }
  })
}

/** A part through its view. Kinds without a view are skipped. */
function MessagePart(props: PartViewProps) {
  const View = viewFor(props.part)
  if (!View) return null
  return <View part={props.part} record={props.record} blobUrl={props.blobUrl} />
}

/** One message: its parts, its state, sibling controls, and actions. */
export function MessageView(props: MessageViewProps) {
  const record = props.record
  const content = record.content as { $type: string; parts?: Part[] }
  const encrypted = content.$type.endsWith('#encryptedContent')
  const parts = content.parts ?? []
  const sources = withKeys(parts.filter((part) => kind(part) === 'sourcePart'))
  const shown = withKeys(parts.filter((part) => kind(part) !== 'sourcePart'))
  return (
    <article id={props.id} className={`message ${record.role as string}`}>
      <header>
        <strong>{record.role === 'user' ? 'You' : 'Assistant'}</strong>
        {props.siblings && props.siblings.messages.length > 1 && (
          <SiblingPicker siblings={props.siblings} />
        )}
      </header>
      {shown.map(({ part, key }) => (
        <MessagePart key={key} part={part} record={record} blobUrl={props.blobUrl} />
      ))}
      {record.status === 'pending' && props.pending}
      {sources.length > 0 && (
        <ul>
          {sources.map(({ part, key }) => (
            <li key={key}>
              <MessagePart part={part} record={record} blobUrl={props.blobUrl} />
            </li>
          ))}
        </ul>
      )}
      {encrypted && <p>This message is encrypted.</p>}
      <Status record={record} pending={props.pending} />
      {props.actions && <footer>{props.actions}</footer>}
    </article>
  )
}
