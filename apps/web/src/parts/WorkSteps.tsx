import { memo, type ReactNode } from 'react'
import { cn } from '../shared/cn.ts'
import { ChevronDownIcon, ChevronRightIcon } from '../shared/icons.tsx'
import { action } from '../shared/ui/actions.ts'
import { Badge } from '../shared/ui/Badge.tsx'
import { Markdown } from './markdown.tsx'
import { formatSeconds, stepDuration, useStepClock, useStepDurations } from './step-clock.ts'
import { type Step, stepsSummary, thoughtFor, thoughtGlimpse } from './steps.ts'
import { type ToolStatus, toolStatus } from './tool-status.ts'
import { toolEntry } from './tools/index.ts'
import type { BlobUrl } from './types.ts'

/*
 * The model's work: a tinted row that opens onto a numbered timeline of more tinted rows, with no
 * border or shadow, so it sits below the messages rather than beside them. Each step opens to show
 * exactly what the model thought, sent, and got back, so the reader can always look inside. Live
 * work breathes.
 */

interface Props {
  steps: Step[]
  /** The message the steps belong to, whose status tells a tool still running from one cut off. */
  record: Record<string, unknown>
  /** Whether the model is still working in this block, so its last step is the current one. */
  live: boolean
  blobUrl: BlobUrl
  /** The reply these steps belong to, so a step's measured time follows it into the record. */
  scope?: string
}

/** A step's clock id within its reply, or none without a reply to scope it to. */
const clockId = (scope: string | undefined, step: Step) =>
  scope ? `${scope}:${step.key}` : undefined

/** What the model is doing right now, from the last step it took. */
function activity(step: Step | undefined, record: Record<string, unknown>): string {
  if (step?.kind === 'reasoning') return 'Thinking…'
  if (step?.kind === 'tool' && toolStatus(step.result, record) === 'running')
    return `${toolEntry(step.call.tool as string).activity}…`
  return 'Reading the results…'
}

/** Whether a step is still going: reasoning still streaming, or a tool waiting for its result. */
const isRunning = (step: Step, current: boolean, record: Record<string, unknown>) =>
  step.kind === 'reasoning' ? current : toolStatus(step.result, record) === 'running'

const breathe = 'animate-breathe motion-reduce:animate-none'

/** A summary that opens its step, with a small chevron that turns as it opens. */
const summary =
  'flex cursor-pointer list-none items-center font-medium text-muted transition-colors duration-(--dur-feedback) hover:text-ink [&::-webkit-details-marker]:hidden'

interface ChevronProps {
  /** The name of the details' group, which turns it as the details open. */
  group: 'steps' | 'step'
}

function Chevron(props: ChevronProps) {
  return (
    <ChevronRightIcon
      className={cn(
        '-ms-0.75 me-1 size-3.25 flex-none opacity-55 transition-transform duration-(--dur-layout) ease-out motion-reduce:transition-none rtl:rotate-180',
        props.group === 'steps'
          ? 'group-open/steps:rotate-90 rtl:group-open/steps:rotate-90'
          : 'group-open/step:rotate-90 rtl:group-open/step:rotate-90',
      )}
    />
  )
}

interface ElapsedProps {
  seconds: number
}

/** How long a running step has taken, quietly, beside its label. */
function Elapsed(props: ElapsedProps) {
  return (
    <span className="ms-1.5 font-normal text-muted tabular-nums">
      {formatSeconds(props.seconds)}
    </span>
  )
}

interface ActivityProps {
  step: Step | undefined
  record: Record<string, unknown>
  scope?: string
}

/** The live summary of a block: what the model is doing, and for how long. */
function Activity(props: ActivityProps) {
  const running = props.step ? isRunning(props.step, true, props.record) : false
  const clock = useStepClock(props.step && clockId(props.scope, props.step), running)
  return (
    <>
      {activity(props.step, props.record)}
      {clock.elapsed !== undefined && <Elapsed seconds={clock.elapsed} />}
    </>
  )
}

/** What some finished steps did, totalling the thinking time when every step was timed. */
const finishedSummary = (steps: Step[], scope: string | undefined) =>
  stepsSummary(
    steps,
    (step) => {
      const id = clockId(scope, step)
      return id ? stepDuration(id) : undefined
    },
    formatSeconds,
    (tool) => toolEntry(tool).label,
  )

/**
 * Each step is a tinted row, numbered in a grey circle like a tracking history: green when it is
 * done, red when it failed, and breathing in the accent while it runs.
 */
const timeline = 'mt-2.25 flex flex-col gap-1.5 [counter-reset:step]'
const stepRow = cn(
  'relative rounded-card bg-sunken py-1.5 ps-10 pe-3 [counter-increment:step]',
  'before:absolute before:start-2.75 before:top-2 before:grid before:size-5.25 before:place-items-center before:rounded-full before:bg-hover before:font-semibold before:text-caption before:text-muted before:content-[counter(step)]',
  'has-[>[data-state=done]]:before:bg-accent-soft has-[>[data-state=done]]:before:text-accent-strong',
  'has-[>[data-state=error]]:before:bg-danger-soft has-[>[data-state=error]]:before:text-danger',
  'has-[>[data-current]]:before:animate-breathe has-[>[data-state=running]]:before:animate-breathe has-[>[data-current]]:before:bg-accent has-[>[data-state=running]]:before:bg-accent has-[>[data-current]]:before:text-on-accent has-[>[data-state=running]]:before:text-on-accent motion-reduce:before:animate-none',
)

/** A run of reasoning and tool use, shown as it happens. */
export function WorkSteps(props: Props) {
  // The finished summary totals the thinking time, which a step records when it stops.
  const finished = useStepDurations(() => finishedSummary(props.steps, props.scope))
  const last = props.steps.length - 1
  const views = props.steps.map((step, i) => (
    <StepView
      key={step.key}
      step={step}
      current={props.live && i === last}
      record={props.record}
      blobUrl={props.blobUrl}
      clock={clockId(props.scope, step)}
    />
  ))
  // One step needs no block around it, unless the model may add more.
  if (views.length === 1 && !props.live) return views[0]
  return (
    <details
      data-steps="block"
      data-live={props.live || undefined}
      className="group/steps details-unfold mt-1 mb-3 text-small"
    >
      {/* The block's summary is a row like a lone step's, so thinking looks the same before and
          after. */}
      <summary
        className={cn(
          summary,
          'rounded-card bg-sunken px-3 py-2 group-open/steps:text-ink',
          props.live && breathe,
        )}
      >
        <Chevron group="steps" />
        {props.live ? (
          <Activity step={props.steps[last]} record={props.record} scope={props.scope} />
        ) : (
          finished
        )}
      </summary>
      <ol className={timeline}>
        {views.map((view) => (
          <li key={view.key} className={stepRow}>
            {view}
          </li>
        ))}
      </ol>
    </details>
  )
}

interface WorkButtonProps {
  steps: Step[]
  scope?: string
  open: boolean
  /** The id of the list the button opens. */
  controls: string
  onToggle: () => void
}

/** The footer button that opens a finished reply's steps under it, named by what they did. */
export function WorkButton(props: WorkButtonProps) {
  // The summary totals the thinking time, which a step records when it stops.
  const label = useStepDurations(() => finishedSummary(props.steps, props.scope))
  return (
    <button
      type="button"
      aria-expanded={props.open}
      aria-controls={props.open ? props.controls : undefined}
      onClick={props.onToggle}
      className={cn(action, 'group/work pe-1.5')}
    >
      {label}
      <ChevronDownIcon className="size-3.25 transition-transform duration-(--dur-layout) ease-out group-aria-expanded/work:rotate-180 motion-reduce:transition-none" />
    </button>
  )
}

interface WorkListProps {
  id: string
  steps: Step[]
  record: Record<string, unknown>
  blobUrl: BlobUrl
  scope?: string
}

/** A finished reply's steps, every block of them, as one numbered list. */
export function WorkList(props: WorkListProps) {
  return (
    <div id={props.id} data-steps="work" className="mt-2 text-small">
      <ol className={cn(timeline, 'mt-0')}>
        {props.steps.map((step) => (
          <li key={step.key} className={stepRow}>
            <StepView
              step={step}
              current={false}
              record={props.record}
              blobUrl={props.blobUrl}
              clock={clockId(props.scope, step)}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}

interface StepViewProps {
  step: Step
  current: boolean
  record: Record<string, unknown>
  blobUrl: BlobUrl
  /** The step's clock id, when its reply is known. */
  clock?: string
}

/** Whether two steps show the same: the steps are rebuilt as a reply streams, their parts aren't. */
function sameStep(a: Step, b: Step): boolean {
  if (a.key !== b.key) return false
  if (a.kind === 'reasoning') return b.kind === 'reasoning' && a.text === b.text
  return b.kind === 'tool' && a.call === b.call && a.result === b.result
}

/**
 * One step. Memoized by what it shows, so a streaming reply rerenders only the step still going,
 * not every step before it.
 */
const StepView = memo(
  function StepView(props: StepViewProps) {
    const step = props.step
    const clock = useStepClock(props.clock, isRunning(step, props.current, props.record))
    if (step.kind === 'reasoning') {
      return (
        <Thought
          text={step.text}
          current={props.current}
          label={props.current ? 'Thinking' : <ReasoningLabel duration={clock.duration} />}
          elapsed={clock.elapsed}
        />
      )
    }
    return (
      <ToolStep
        step={step}
        status={toolStatus(step.result, props.record)}
        record={props.record}
        blobUrl={props.blobUrl}
        elapsed={clock.elapsed}
      />
    )
  },
  (prev, next) =>
    prev.current === next.current &&
    prev.record.status === next.record.status &&
    prev.blobUrl === next.blobUrl &&
    prev.clock === next.clock &&
    sameStep(prev.step, next.step),
)

interface ThoughtProps {
  text: string
  /** Whether the model is still thinking it. */
  current: boolean
  /** "Thinking" while it runs, or "Thought for 12s" once it is done. */
  label: ReactNode
  /** Seconds it has been thinking, while it runs. */
  elapsed?: number
}

/**
 * A reasoning step, as a tool step is: a row naming the thought with a glimpse of its first line,
 * which opens onto the whole thought. Open, the thought shows its first line itself, so the glimpse
 * goes.
 */
function Thought(props: ThoughtProps) {
  return (
    <details
      data-step="reasoning"
      data-current={props.current || undefined}
      className="group/step details-unfold"
    >
      <summary className={cn(summary, 'gap-1 truncate py-0.5 group-open/step:text-ink')}>
        <Chevron group="step" />
        <span className="flex-none text-ink-strong">{props.label}</span>{' '}
        <span dir="auto" className="truncate font-normal text-muted group-open/step:hidden">
          {thoughtGlimpse(props.text)}
        </span>
        {props.elapsed !== undefined && <Elapsed seconds={props.elapsed} />}
      </summary>
      <Markdown
        text={props.text}
        streaming={props.current}
        className="mt-0.75 mb-1 text-muted leading-[1.6] [font-size:inherit] [&>*>:first-child]:mt-0 [&>*>:last-child]:mb-0 [&_strong]:text-ink"
      />
    </details>
  )
}

interface ReasoningLabelProps {
  duration?: number
}

/** "Thought for 12s" when the thinking was timed, or "Thought" when it wasn't watched. */
function ReasoningLabel(props: ReasoningLabelProps) {
  if (props.duration === undefined) return <>Thought</>
  return <>{thoughtFor(props.duration, formatSeconds)}</>
}

interface ToolStepProps {
  step: Extract<Step, { kind: 'tool' }>
  status: ToolStatus
  record: Record<string, unknown>
  blobUrl: BlobUrl
  /** Seconds the tool has been running, while it runs. */
  elapsed?: number
}

/** What a tool's badge says, for each status but done, which needs none. */
const badges: Record<Exclude<ToolStatus, 'done'>, string> = {
  running: 'running',
  error: 'failed',
  incomplete: 'incomplete',
}

/**
 * A tool call and its result, as one step: a row naming what it did, with a glimpse of its input
 * and its state as a badge, that opens onto the tool's view.
 */
function ToolStep(props: ToolStepProps) {
  const { call, result } = props.step
  const entry = toolEntry(call.tool as string)
  const status = props.status
  return (
    <details data-step="tool" data-state={status} className="group/step details-unfold">
      <summary className={cn(summary, 'gap-1 truncate py-0.5 group-open/step:text-ink')}>
        <Chevron group="step" />
        {entry.code ? (
          <code className="text-caption text-ink-strong">{entry.label}</code>
        ) : (
          <span className="text-ink-strong">{entry.label}</span>
        )}{' '}
        {/* The glimpse of the input stands in for the input the default view shows in full, so
            there it goes once open. A tool's own view shows what it found, not what it asked. */}
        <span
          dir="auto"
          className={cn(
            'truncate font-normal text-muted',
            entry.code && 'font-mono text-caption group-open/step:hidden',
          )}
        >
          {entry.glimpse((call.input as string | undefined) ?? '')}
        </span>{' '}
        {status !== 'done' && (
          <Badge
            tone={status === 'running' ? 'good' : status === 'error' ? 'danger' : undefined}
            className={cn('ms-1.25', status === 'running' && breathe)}
          >
            {badges[status]}
          </Badge>
        )}
        {props.elapsed !== undefined && <Elapsed seconds={props.elapsed} />}
      </summary>
      <entry.View
        call={call}
        result={result}
        status={status}
        record={props.record}
        blobUrl={props.blobUrl}
      />
    </details>
  )
}
