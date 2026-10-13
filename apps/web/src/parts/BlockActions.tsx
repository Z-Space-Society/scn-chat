import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../shared/cn.ts'
import { IconButton } from '../shared/ui/Button.tsx'
import { MenuItem } from '../shared/ui/MenuItem.tsx'
import { floating } from '../shared/ui/menu.ts'
import { useDismiss } from '../shared/useDismiss.ts'
import { usePlacement } from '../shared/usePlacement.ts'

/**
 * The icon actions in the corner of a block of a reply, such as a code block or a table, on a
 * card of the block's own color, so the text they sit over doesn't show through. They show on hover
 * like the message actions, always on a touch screen, and while one of their menus is open.
 */
export const blockActions =
  'absolute end-1.5 top-1.5 flex gap-0.5 rounded-small border border-line bg-raised p-0.5 opacity-0 touch:opacity-100 transition-opacity duration-(--dur-feedback) focus-within:opacity-100 group-hover/block:opacity-100 has-aria-expanded:opacity-100'

/** An icon button among a block's actions, tinting while its menu is open. */
export const blockAction = 'p-1 aria-expanded:bg-hover aria-expanded:text-ink'

interface Item {
  label: string
  run: () => unknown
}

interface Props {
  /** What the button does, such as "Copy table". */
  label: string
  /** What it says for a moment once an item has run, such as "Copied". */
  done?: string
  /** Its icon, given whether an item has just run, so copying can show a check. */
  icon: (done: boolean) => ReactNode
  items: Item[]
}

const menu = cn(floating, 'fixed z-50 flex min-w-36 flex-col gap-0.5')

/** A block's action with a choice of how, such as copying a table as CSV or as Markdown. */
export function ActionMenu(props: Props) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const floatingRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const position = usePlacement(open, button, floatingRef, 'end')
  useDismiss(open, [button, floatingRef], (reason) => {
    setOpen(false)
    if (reason === 'escape') button.current?.focus()
  })

  // The menu starts at its first item, so the keyboard lands inside it.
  useEffect(() => {
    if (open) floatingRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [open])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(timer)
  }, [done])

  const run = async (item: Item) => {
    setOpen(false)
    button.current?.focus()
    await item.run()
    if (props.done) setDone(true)
  }

  return (
    <>
      <IconButton
        ref={button}
        aria-label={done && props.done ? props.done : props.label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={blockAction}
      >
        {props.icon(done)}
      </IconButton>
      {open &&
        createPortal(
          <div ref={floatingRef} id={id} style={position} className={menu}>
            {props.items.map((item) => (
              <MenuItem key={item.label} onClick={() => void run(item)}>
                {item.label}
              </MenuItem>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
