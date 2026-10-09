import type { ReactNode } from 'react'

interface Props {
  /** The kind of page, as a class for the theme, such as `settings` or `chats`. */
  className: string
  /** What the sidebar holds, such as links to each section. */
  nav: ReactNode
  children: ReactNode
}

/** A page with a sidebar beside its main column. */
export function SidebarLayout(props: Props) {
  return (
    <div className={`layout ${props.className}`}>
      <nav className="sidebar">{props.nav}</nav>
      <main>{props.children}</main>
    </div>
  )
}
