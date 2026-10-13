import { ArrowDownIcon, ArrowUpIcon } from '../../../shared/icons.tsx'
import { IconButton } from '../../../shared/ui/Button.tsx'

interface Props {
  index: number
  count: number
  /** Whether a move is on its way, so another waits for it. */
  disabled?: boolean
  /** Move the item by this many places: -1 for up, 1 for down. */
  onMove: (by: number) => void
}

/** Up and down arrows for an item in an ordered list. */
export function ReorderButtons(props: Props) {
  return (
    <span className="inline-flex flex-none gap-0.5">
      <IconButton
        aria-label="Move up"
        disabled={props.index === 0 || props.disabled}
        onClick={() => props.onMove(-1)}
      >
        <ArrowUpIcon />
      </IconButton>
      <IconButton
        aria-label="Move down"
        disabled={props.index === props.count - 1 || props.disabled}
        onClick={() => props.onMove(1)}
      >
        <ArrowDownIcon />
      </IconButton>
    </span>
  )
}
