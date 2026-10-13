import type { Effort } from '@scn-chat/lexicons'
import { Select, type SelectOption } from '../../../shared/ui/Select.tsx'

/** Each level from fastest to deepest, named as a step on a scale, and how much of a timer its pie fills. */
const STEPS: { level: Effort; label: string; hint?: string; time: number }[] = [
  { level: 'none', label: 'Off', hint: 'Answers right away', time: 0 },
  { level: 'low', label: 'Low', time: 0.25 },
  { level: 'medium', label: 'Medium', time: 0.5 },
  { level: 'high', label: 'High', time: 0.75 },
  { level: 'max', label: 'Extra', time: 1 },
]

/** Whether a value is one of the effort levels, as one read back from storage should be. */
export const isEffort = (value: string): value is Effort =>
  STEPS.some((step) => step.level === value)

interface PieProps {
  /** How much of the timer is filled, from 0 to 1. */
  time: number
  /** Whether the ring is dashed, for Auto, whose time is the model's to choose. */
  open?: boolean
}

/**
 * A small timer: a ring with a pie inside it filled clockwise from the top in the accent color, as
 * thinking takes time.
 */
function TimerPie(props: PieProps) {
  const angle = props.time * 2 * Math.PI
  const x = 8 + 4.5 * Math.sin(angle)
  const y = 8 - 4.5 * Math.cos(angle)
  return (
    <svg data-pie viewBox="0 0 16 16" aria-hidden className="size-icon flex-none">
      <circle
        cx="8"
        cy="8"
        r="7"
        strokeDasharray={props.open ? '2.2 2.2' : undefined}
        className="fill-none stroke-[1.4] stroke-faint"
      />
      {props.time >= 1 && <circle cx="8" cy="8" r="4.5" className="fill-accent" />}
      {props.time > 0 && props.time < 1 && (
        <path
          d={`M8 8 L8 3.5 A4.5 4.5 0 ${props.time > 0.5 ? 1 : 0} 1 ${x} ${y} Z`}
          className="fill-accent"
        />
      )}
    </svg>
  )
}

/** The option for no level, which leaves the effort to something else, named for what that is. */
export interface AutoEffort {
  label: string
  /** Who decides the effort, such as "Each model decides". */
  detail: string
}

/** The effort levels as options, after the option for no level, each marked with its timer pie. */
export const effortOptions = (auto: AutoEffort): SelectOption[] => [
  { value: '', label: auto.label, detail: auto.detail, icon: <TimerPie time={0} open /> },
  ...STEPS.map((step) => ({
    value: step.level,
    label: step.label,
    detail: step.hint,
    icon: <TimerPie time={step.time} />,
  })),
]

interface Props {
  /** The chosen level, or "" for none, which leaves it to what `auto` names. */
  value: string
  onChange: (value: string) => void
  id?: string
  'aria-label'?: string
  /** What the option for no level is called where it shows, and who decides then. */
  auto: AutoEffort
  className?: string
}

/**
 * Reasoning effort as a menu headed "Thinking effort", of levels on a scale from Off to Extra, each
 * marked with a timer pie that fills the longer the model thinks, with Auto's ring dashed. The
 * button shows the chosen level's pie and name.
 */
export function EffortSelect(props: Props) {
  return (
    <Select
      id={props.id}
      aria-label={props['aria-label']}
      title="Thinking effort: how long the model thinks before it answers"
      heading="Thinking effort"
      className={props.className}
      options={effortOptions(props.auto)}
      value={props.value}
      onChange={props.onChange}
    />
  )
}
