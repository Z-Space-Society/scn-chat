export interface Siblings {
  index: number
  count: number
  onPick: (index: number) => void
}

interface Props {
  siblings: Siblings
}

/** Arrows to step between alternative versions of a message. */
export function SiblingPicker(props: Props) {
  return (
    <span className="siblings">
      <button
        type="button"
        aria-label="Previous version"
        disabled={props.siblings.index === 0}
        onClick={() => props.siblings.onPick(props.siblings.index - 1)}
      >
        ‹
      </button>
      {props.siblings.index + 1} / {props.siblings.count}
      <button
        type="button"
        aria-label="Next version"
        disabled={props.siblings.index === props.siblings.count - 1}
        onClick={() => props.siblings.onPick(props.siblings.index + 1)}
      >
        ›
      </button>
    </span>
  )
}
