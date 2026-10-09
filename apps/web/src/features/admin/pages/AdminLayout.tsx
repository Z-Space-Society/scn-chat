import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SectionNav } from '../../../shared/SectionNav.tsx'
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
  { to: '/admin/api-keys', label: 'API keys' },
  { to: '/admin/cron', label: 'Cron' },
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
          {/* A plugin's own page counts as the plugins section. */}
          <SectionNav sections={sections} activeOptions={{ includeSearch: false }} />
        </>
      }
    >
      {props.children}
    </SidebarLayout>
  )
}
