import type { ComponentProps } from 'react'
import { cn } from '../cn.ts'
import { menuRow } from './menu.ts'

interface Props extends ComponentProps<'button'> {
  /** Red, for something that can't be undone, such as delete. */
  danger?: boolean
}

/** A row of a floating menu that acts, its icon brightening with its text when hovered. */
export function MenuItem(props: Props) {
  const { danger, className, type = 'button', ...rest } = props
  return (
    <button
      {...rest}
      type={type}
      className={cn(
        menuRow,
        'w-full cursor-pointer hover:bg-row-hover active:bg-row-hover [&_svg]:text-muted hover:[&_svg]:text-ink',
        danger && 'text-danger [&_svg]:text-danger hover:[&_svg]:text-danger',
        className,
      )}
    />
  )
}
