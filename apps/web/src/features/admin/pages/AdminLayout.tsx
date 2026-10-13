import type { ReactNode } from 'react'
import {
  ChatIcon,
  ClockIcon,
  CubeIcon,
  KeyIcon,
  LockIcon,
  PuzzleIcon,
  RolesIcon,
  SettingsIcon,
  SlidersIcon,
  SyncIcon,
  UsersIcon,
} from '../../../shared/icons.tsx'
import { NavHeader, SectionNav } from '../../../shared/SectionNav.tsx'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'

/** The sections in groups: who may use the app, what it runs, and how it runs. */
const groups = [
  {
    label: 'People',
    sections: [
      { to: '/admin/users', label: 'Users', icon: <UsersIcon /> },
      { to: '/admin/roles', label: 'Roles', icon: <RolesIcon /> },
      { to: '/admin/access', label: 'Access', icon: <LockIcon /> },
    ],
  },
  {
    label: 'Features',
    sections: [
      { to: '/admin/plugins', label: 'Plugins', icon: <PuzzleIcon /> },
      { to: '/admin/models', label: 'Models', icon: <CubeIcon /> },
    ],
  },
  {
    label: 'App',
    sections: [
      { to: '/admin/general', label: 'General', icon: <SlidersIcon /> },
      { to: '/admin/turns', label: 'Turns', icon: <ChatIcon /> },
      { to: '/admin/sync', label: 'Sync', icon: <SyncIcon /> },
      { to: '/admin/api-keys', label: 'API keys', icon: <KeyIcon /> },
      { to: '/admin/cron', label: 'Cron', icon: <ClockIcon /> },
    ],
  },
] as const

const settings = [{ to: '/settings', label: 'Settings', icon: <SettingsIcon /> }] as const

interface Props {
  children: ReactNode
}

export function AdminLayout(props: Props) {
  return (
    <SidebarLayout
      kind="settings"
      nav={
        <>
          <NavHeader title="Admin" />
          {groups.map((group) => (
            // A plugin's own page counts as the plugins section.
            <SectionNav
              key={group.label}
              label={group.label}
              sections={group.sections}
              activeOptions={{ includeSearch: false }}
            />
          ))}
          <SectionNav sections={settings} activeOptions={{ exact: true }} apart />
        </>
      }
    >
      {props.children}
    </SidebarLayout>
  )
}
