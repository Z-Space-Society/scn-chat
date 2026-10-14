import type { ReactNode } from 'react'
import { cn } from '../cn.ts'
import { floating } from './menu.ts'

/**
 * The class for a form around a panel card. The form lays out no box of its own, so the floating
 * card alone takes part in the layout it opens from, such as the header's row, and takes no room
 * there.
 */
export const panelForm = 'contents'

interface Props {
  /** What the panel is for, its legend. */
  title: string
  /** Classes that place the panel, such as under the control that opened it. */
  className?: string
  children: ReactNode
}

/**
 * A floating panel of controls under its title, such as a chat's sharing, whose corner nests around
 * its controls'. Its controls wrap in rows.
 */
export function PanelCard(props: Props) {
  return (
    <fieldset
      className={cn(
        floating,
        'flex w-[min(--spacing(104),calc(100%-(--spacing(5.5))))] flex-wrap gap-2 rounded-[calc(var(--radius-small)+--spacing(3.5)+var(--menu-edge))] p-3.5',
        props.className,
      )}
    >
      <legend className="float-start w-full font-semibold text-ink-strong text-ui">
        {props.title}
      </legend>
      {props.children}
    </fieldset>
  )
}
