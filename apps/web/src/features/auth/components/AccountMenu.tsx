import { Link } from '@tanstack/react-router'
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { MoreVerticalIcon, SettingsIcon, ShieldIcon, SignOutIcon } from '../../../shared/icons.tsx'
import { floating } from '../../../shared/ui/menu.ts'
import { sidebarRow } from '../../../shared/ui/sidebar.ts'
import { MeContext } from '../session.ts'
import { AccountCard } from './AccountCard.tsx'

interface Props {
  /** A small mark on the avatar's corner, such as a status dot. */
  badge: ReactNode
  /** What heads the menu, above its links. */
  status: ReactNode
  /** Signs out. The caller shows why it failed, since the menu has closed by then. */
  onSignOut: () => void
}

/**
 * Who is signed in, as a button that opens a menu of the caller's status, Settings, Admin for
 * admins, and Sign out. The menu is a piece of the sidebar lifted over it, rising from the account,
 * and reaches past the button by its padding and edge, so its rows line up with the sidebar's.
 */
export function AccountMenu(props: Props) {
  const me = useContext(MeContext)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Escape or a click outside the menu closes it.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div ref={root} className="min-w-0 flex-1">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group/account flex w-full cursor-pointer items-center rounded-small p-1.5 pe-2.5 text-start hover:bg-row-hover active:bg-row-hover aria-expanded:bg-row-hover"
      >
        <AccountCard badge={props.badge} />
        <MoreVerticalIcon className="size-3.75 text-icon-quiet" />
      </button>
      {open && (
        <div
          className={cn(
            floating,
            'absolute inset-x-[calc(-1*(var(--menu-pad)+var(--menu-edge)))] bottom-[calc(100%+--spacing(1.25))] z-30 flex animate-panel-up flex-col gap-0.5 motion-reduce:animate-fade-in',
          )}
        >
          {props.status}
          <Link to="/settings" onClick={() => setOpen(false)} className={sidebarRow}>
            <SettingsIcon /> Settings
          </Link>
          {me?.admin && (
            <Link to="/admin" onClick={() => setOpen(false)} className={sidebarRow}>
              <ShieldIcon /> Admin
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              props.onSignOut()
            }}
            className={cn(sidebarRow, 'cursor-pointer')}
          >
            <SignOutIcon /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
