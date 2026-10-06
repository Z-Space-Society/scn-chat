import type { ReactNode } from 'react'

interface Props {
  /** What the sidebar holds, such as links to each section. */
  nav: ReactNode
  children: ReactNode
}

/** A settings-style page: a sidebar beside the current section. */
export function SidebarLayout(props: Props) {
  return (
    <div className="layout settings">
      <nav className="sidebar">{props.nav}</nav>
      <main>{props.children}</main>
    </div>
  )
}
