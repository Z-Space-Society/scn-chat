import { cn } from '../cn.ts'
import { SidebarIcon } from '../icons.tsx'
import { useSidebar } from '../useSidebar.ts'

interface Props {
  className?: string
}

/**
 * Show or hide the sidebar: the column on a wide screen, the drawer on a narrow one. A quiet square
 * that tints on hover like a row.
 */
export function SidebarToggle(props: Props) {
  const sidebar = useSidebar()
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      title="Toggle sidebar"
      onClick={sidebar.toggle}
      className={cn(
        'inline-flex size-toggle flex-none cursor-pointer items-center justify-center rounded-row border border-transparent bg-transparent text-muted hover:bg-row-hover hover:text-ink active:bg-row-hover',
        props.className,
      )}
    >
      <SidebarIcon />
    </button>
  )
}
