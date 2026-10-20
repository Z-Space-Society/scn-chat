import type { Usage } from '@scn-chat/lexicons'
import { useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { InfoIcon } from '../../../shared/icons.tsx'
import type { MessageRecord } from '../../../shared/message.ts'
import { iconAction } from '../../../shared/ui/actions.ts'
import { floating } from '../../../shared/ui/menu.ts'
import { Popover } from '../../../shared/ui/Popover.tsx'
import { usePopover } from '../../../shared/usePopover.ts'

const count = (n: number) => n.toLocaleString()

function usageLine(usage: Usage): string | null {
  const line = [
    usage.inputTokens !== undefined && `${count(usage.inputTokens)} in`,
    usage.outputTokens !== undefined && `${count(usage.outputTokens)} out`,
    usage.reasoningTokens && `${count(usage.reasoningTokens)} of them thinking`,
  ].filter(Boolean)
  return line.length ? line.join(' · ') : null
}

interface RecordRowsProps {
  /** The message's record key. */
  rkey?: string
  record: MessageRecord
  /** Where the record lives, such as the user's PDS. */
  storedIn?: string
}

/**
 * What the record says about the message, beyond its text: who made it, how, when, and where it
 * lives.
 */
export function recordRows(props: RecordRowsProps): [string, string][] {
  const record = props.record
  const model = record.model ?? record.generation?.model
  const effort = record.effort ?? record.generation?.effort
  const usage = record.usage ? usageLine(record.usage) : null
  const rows: [string, string][] = []
  if (model)
    rows.push([record.role === 'user' ? 'Asked for' : 'Model', `${model.provider} / ${model.id}`])
  if (effort) rows.push(['Effort', effort])
  if (usage) rows.push(['Tokens', usage])
  if (record.status) rows.push(['Status', record.status])
  if (record.createdAt) rows.push(['Written', new Date(record.createdAt).toLocaleString()])
  if (props.rkey) rows.push(['Record key', props.rkey])
  if (props.storedIn) rows.push(['Stored in', props.storedIn])
  return rows
}

/** The card the details float in, by the button that opened them, so they never move the message. */
export const detailsCard = cn(
  floating,
  'fixed z-50 max-w-[min(--spacing(88),calc(100vw-(--spacing(4))))] px-3.5 py-3 text-caption',
)

interface DetailsListProps {
  rows: [string, string][]
}

/** The record's rows as terms and values. */
export function DetailsList(props: DetailsListProps) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.25">
      {props.rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted">{term}</dt>
          <dd className="font-medium text-ink-strong [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface DetailsButtonProps {
  rows: [string, string][]
}

/**
 * A button among a message's actions that opens the details in a card floating by it. Escape or a
 * click outside closes the card, and Escape returns focus to the button.
 */
export function DetailsButton(props: DetailsButtonProps) {
  const [open, setOpen] = useState(false)
  const { anchor, trigger, popover } = usePopover(open, () => setOpen(false))

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label="Details"
        title="Details"
        {...trigger}
        onClick={() => setOpen(!open)}
        className={iconAction}
      >
        <InfoIcon />
      </button>
      <Popover {...popover} className={detailsCard}>
        <DetailsList rows={props.rows} />
      </Popover>
    </>
  )
}
