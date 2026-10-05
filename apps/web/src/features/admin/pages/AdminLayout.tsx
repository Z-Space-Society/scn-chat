import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'

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

interface Props {
  children: ReactNode
}

export function AdminLayout(props: Props) {
  return (
    <SidebarLayout
      nav={
        <>
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
        </>
      }
    >
      {props.children}
    </SidebarLayout>
  )
}
