interface Props {
  index: number
  count: number
  /** Move the item by this many places: -1 for up, 1 for down. */
  onMove: (by: number) => void
}

/** Up and Down buttons for an item in an ordered list. */
export function ReorderButtons(props: Props) {
  return (
    <>
      <button type="button" disabled={props.index === 0} onClick={() => props.onMove(-1)}>
        Up
      </button>{' '}
      <button
        type="button"
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(1)}
      >
        Down
      </button>
    </>
  )
}
