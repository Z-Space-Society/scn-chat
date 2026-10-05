import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const sections = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/roles', label: 'Roles' },
  { to: '/admin/access', label: 'Access' },
  { to: '/admin/plugins', label: 'Plugins' },
  { to: '/admin/models', label: 'Models' },
  { to: '/admin/general', label: 'General' },
  { to: '/admin/turns', label: 'Turns' },
  { to: '/admin/sync', label: 'Sync' },
] as const

/** The admin sidebar around the current section. */
export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="layout settings">
      <nav className="sidebar">
        <Link to="/" activeOptions={{ exact: true }}>
          Back to chats
        </Link>
        <Link to="/settings" activeOptions={{ exact: true }}>
          Account settings
        </Link>
        <ul>
          {sections.map((section) => (
            <li key={section.to}>
              {/* A plugin's own page counts as the plugins section. */}
              <Link to={section.to} activeOptions={{ includeSearch: false }}>
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  )
}
