import { ChevronLeftIcon, ChevronRightIcon } from '../../../shared/icons.tsx'

/** A message's alternative versions, and which one is shown. */
export interface Siblings {
  /** The place of the one shown, and how many there are. */
  index: number
  count: number
  /** The versions on either side, by rkey. */
  previous?: string
  next?: string
  /** Show another version, by its rkey. */
  onPick: (rkey: string) => void
}

interface Props {
  siblings: Siblings
}

/** Small chevrons in square buttons, as faint as the model's name beside them. */
const arrow =
  'inline-flex size-5.25 cursor-pointer items-center justify-center rounded-badge text-inherit hover:not-disabled:bg-hover hover:not-disabled:text-ink active:bg-hover disabled:cursor-default disabled:opacity-40'

/** Arrows to step between alternative versions of a message, around a count that keeps its width. */
export function SiblingPicker(props: Props) {
  const previous = props.siblings.previous
  const next = props.siblings.next
  return (
    <span className="inline-flex items-center gap-0.5 text-caption text-muted">
      <button
        type="button"
        aria-label="Previous version"
        disabled={!previous}
        onClick={() => previous && props.siblings.onPick(previous)}
        className={arrow}
      >
        <ChevronLeftIcon className="size-3.5" />
      </button>
      <span className="min-w-6.5 text-center tabular-nums">
        {props.siblings.index + 1}/{props.siblings.count}
      </span>
      <button
        type="button"
        aria-label="Next version"
        disabled={!next}
        onClick={() => next && props.siblings.onPick(next)}
        className={arrow}
      >
        <ChevronRightIcon className="size-3.5" />
      </button>
    </span>
  )
}
