import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../shared/cn.ts'
import { ChevronDownIcon, ChevronRightIcon } from '../shared/icons.tsx'
import { action } from '../shared/ui/actions.ts'
import { Markdown } from './markdown.tsx'
import { formatSeconds, stepDuration, useStepClock, useStepDurations } from './step-clock.ts'
import { inputGlimpse, pretty, type Step, stepsSummary, thoughtFor } from './steps.ts'
import type { BlobRef, BlobUrl } from './types.ts'

/*
 * The model's work: a tinted row that opens onto a numbered timeline of more tinted rows, with no
 * border or shadow, so it sits below the messages rather than beside them. Each step opens to show
 * exactly what the model thought, sent, and got back, so the reader can always look inside. Live
 * work breathes.
 */

interface Props {
  steps: Step[]
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
function activity(step: Step | undefined): string {
  if (step?.kind === 'reasoning') return 'Thinking…'
  if (step?.kind === 'tool' && !step.result) return `Running ${step.call.tool as string}…`
  return 'Reading the results…'
}

/** Whether a step is still going: reasoning still streaming, or a tool waiting for its result. */
const isRunning = (step: Step, current: boolean) =>
  current && (step.kind === 'reasoning' || !step.result)

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
  scope?: string
}

/** The live summary of a block: what the model is doing, and for how long. */
function Activity(props: ActivityProps) {
  const running = props.step ? isRunning(props.step, true) : false
  const clock = useStepClock(props.step && clockId(props.scope, props.step), running)
  return (
    <>
      {activity(props.step)}
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
  'has-[>[data-state=failed]]:before:bg-danger-soft has-[>[data-state=failed]]:before:text-danger',
  'has-[>[data-current]]:before:animate-breathe has-[>[data-state=running]]:before:animate-breathe has-[>[data-current]]:before:bg-accent has-[>[data-state=running]]:before:bg-accent has-[>[data-current]]:before:text-on-accent has-[>[data-state=running]]:before:text-on-accent motion-reduce:before:animate-none',
)

/** A run of reasoning and tool use, shown as it happens. */
export function WorkSteps(props: Props) {
  // The finished summary totals the thinking time, which a step records when it stops.
  useStepDurations()
  const last = props.steps.length - 1
  const views = props.steps.map((step, i) => (
    <StepView
      key={step.key}
      step={step}
      current={props.live && i === last}
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
          <Activity step={props.steps[last]} scope={props.scope} />
        ) : (
          finishedSummary(props.steps, props.scope)
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
  useStepDurations()
  return (
    <button
      type="button"
      aria-expanded={props.open}
      aria-controls={props.open ? props.controls : undefined}
      onClick={props.onToggle}
      className={cn(action, 'group/work pe-1.5')}
    >
      {finishedSummary(props.steps, props.scope)}
      <ChevronDownIcon className="size-3.25 transition-transform duration-(--dur-layout) ease-out group-aria-expanded/work:rotate-180 motion-reduce:transition-none" />
    </button>
  )
}

interface WorkListProps {
  id: string
  steps: Step[]
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
  blobUrl: BlobUrl
  /** The step's clock id, when its reply is known. */
  clock?: string
}

function StepView(props: StepViewProps) {
  const step = props.step
  const clock = useStepClock(props.clock, isRunning(step, props.current))
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
    <ToolStep step={step} current={props.current} blobUrl={props.blobUrl} elapsed={clock.elapsed} />
  )
}

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
 * A reasoning step: a row naming the thought, with its first three lines showing below it, or its
 * newest three while it runs, fading out where they are cut. A quiet Show more under them, or a
 * click anywhere on it, opens the whole thought, and Show less closes it again. A thought that
 * fits in three lines has nothing to open.
 */
function Thought(props: ThoughtProps) {
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const id = useId()

  // Closed, the thought is cut to three lines, and only one that runs past them can open.
  useLayoutEffect(() => {
    const element = body.current
    const content = element?.firstElementChild
    if (open || !element || !content) return
    const measure = () =>
      setOverflows(content.getBoundingClientRect().height > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(content)
    return () => observer.disconnect()
  }, [open])

  const openable = open || overflows
  const state = {
    'data-current': props.current || undefined,
    'data-open': open || undefined,
    'data-openable': openable || undefined,
  }
  return (
    // Show more is the button, for the keyboard and screen readers. A click anywhere else on a
    // closed thought opens it too, as a larger target, unless it follows a link or ends a
    // selection.
    // biome-ignore lint/a11y/noStaticElementInteractions: Show more is the control; this only widens its target.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Show more opens it from the keyboard.
    <div
      {...state}
      data-step="reasoning"
      className="group/thought data-openable:not-data-open:cursor-pointer"
      onClick={(event) => {
        if (open || !overflows) return
        if ((event.target as Element).closest('a, button')) return
        if (window.getSelection()?.toString()) return
        setOpen(true)
      }}
    >
      <p
        className={cn(
          'py-0.5 font-medium text-muted transition-colors duration-(--dur-feedback) group-data-open/thought:text-ink group-data-openable/thought:group-hover/thought:text-ink',
          props.current && breathe,
        )}
      >
        {props.label}
        {props.elapsed !== undefined && <Elapsed seconds={props.elapsed} />}
      </p>
      {/* The thought, the same size as the row above it and as quiet. Running, its newest lines
          show, so the oldest fade out at the top. */}
      <div
        {...state}
        data-thought
        id={id}
        ref={body}
        className="mt-0.75 mb-1 not-data-open:max-h-[3lh] not-data-open:overflow-hidden text-muted leading-[1.6] data-current:not-data-open:flex data-current:not-data-open:flex-col data-current:not-data-open:justify-end data-current:data-openable:not-data-open:[mask-image:linear-gradient(transparent,black_1lh)] data-openable:not-data-open:[mask-image:linear-gradient(black_calc(100%-1lh),transparent)]"
      >
        <Markdown
          text={props.text}
          streaming={props.current}
          className="text-inherit leading-[inherit] [font-size:inherit] [&>*>:first-child]:mt-0 [&_strong]:text-ink"
        />
      </div>
      {openable && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="mb-0.75 block cursor-pointer rounded-badge py-0.5 text-caption text-tint-quiet transition-colors duration-(--dur-feedback) hover:text-ink focus-visible:text-ink group-data-openable/thought:group-hover/thought:text-ink"
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
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

interface ToolStepProps extends Omit<StepViewProps, 'step' | 'clock'> {
  step: Extract<Step, { kind: 'tool' }>
  /** Seconds the tool has been running, while it runs. */
  elapsed?: number
}

/** A label over a tool's input or output. */
const stepLabel =
  'mt-2.5 font-semibold text-caption text-muted group-data-[state=failed]/step:text-danger'

/** A tool's input or output, as it was sent or returned, scrolling when long. */
const stepCode =
  'mt-1.25 mb-0.75 max-h-80 overflow-auto whitespace-pre-wrap rounded-small bg-surface px-3.5 py-3 font-mono text-code-block text-ink leading-normal'

/** A tool call and its result, as one step, with its state as a badge beside its name. */
function ToolStep(props: ToolStepProps) {
  const { call, result } = props.step
  const input = (call.input as string | undefined) ?? ''
  const outputBlob = result?.outputBlob as BlobRef | undefined
  let state = 'done'
  if (result?.isError) state = 'failed'
  else if (!result) state = props.current ? 'running' : 'no result'
  return (
    <details data-step="tool" data-state={state} className="group/step details-unfold">
      <summary className={cn(summary, 'gap-1 truncate py-0.5 group-open/step:text-ink')}>
        <Chevron group="step" />
        <code className="text-caption text-ink-strong">{call.tool as string}</code>{' '}
        {/* The glimpse of the input only stands in for what is inside, so it goes once open. */}
        <span className="truncate font-mono font-normal text-caption text-muted group-open/step:hidden">
          {inputGlimpse(input)}
        </span>{' '}
        {state !== 'done' && (
          <span
            className={cn(
              'ms-1.25 inline-block rounded-badge bg-surface px-1.5 py-px font-semibold text-caption text-muted',
              state === 'running' && cn('bg-accent-soft text-accent-strong', breathe),
              state === 'failed' && 'bg-danger-soft text-danger',
            )}
          >
            {state}
          </span>
        )}
        {props.elapsed !== undefined && <Elapsed seconds={props.elapsed} />}
      </summary>
      {input && (
        <>
          <div className={stepLabel}>Input</div>
          <pre className={stepCode}>{pretty(input)}</pre>
        </>
      )}
      {result && (
        <>
          <div className={stepLabel}>{result.isError ? 'Error' : 'Output'}</div>
          <pre className={stepCode}>{pretty(result.output as string)}</pre>
          {outputBlob && (
            <a
              href={props.blobUrl(outputBlob.ref.$link, outputBlob.mimeType)}
              className="text-caption"
            >
              Full output
            </a>
          )}
        </>
      )}
    </details>
  )
}
