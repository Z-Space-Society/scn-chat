import type { BranchMessage } from '../lib/branch.ts'

/** A message's alternative versions, and which one is shown. */
export interface Siblings {
  messages: BranchMessage[]
  index: number
  /** Show another version, by its rkey. */
  onPick: (rkey: string) => void
}

interface Props {
  siblings: Siblings
}

/** Arrows to step between alternative versions of a message. */
export function SiblingPicker(props: Props) {
  const previous = props.siblings.messages[props.siblings.index - 1]
  const next = props.siblings.messages[props.siblings.index + 1]
  return (
    <span className="siblings">
      <button
        type="button"
        aria-label="Previous version"
        disabled={!previous}
        onClick={() => previous && props.siblings.onPick(previous.rkey)}
      >
        ‹
      </button>
      {props.siblings.index + 1} / {props.siblings.messages.length}
      <button
        type="button"
        aria-label="Next version"
        disabled={!next}
        onClick={() => next && props.siblings.onPick(next.rkey)}
      >
        ›
      </button>
    </span>
  )
}
