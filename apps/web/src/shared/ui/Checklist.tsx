import type { ReactNode } from 'react'

interface ChecklistProps {
  children: ReactNode
}

/** A card's grid of things to tick, such as the models a provider lists, which scrolls when long. */
export function Checklist(props: ChecklistProps) {
  return (
    <ul className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(--spacing(56),1fr))] gap-x-4 gap-y-1.5 overflow-y-auto px-card-pad pt-card-pad text-small">
      {props.children}
    </ul>
  )
}

interface ChecklistItemProps {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  /** What ticking it picks, which labels the checkbox. */
  children: ReactNode
}

/** One thing to tick in a checklist. */
export function ChecklistItem(props: ChecklistItemProps) {
  return (
    <li>
      <label className="flex items-baseline gap-1.5">
        <input
          type="checkbox"
          className="m-0 flex-none self-center accent-accent"
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onChange}
        />
        {props.children}
      </label>
    </li>
  )
}
