import type { ReactNode } from 'react'
import { KeyIcon, PuzzleIcon, ShieldIcon, SlidersIcon, SyncIcon } from '../../../shared/icons.tsx'
import { NavHeader, SectionNav } from '../../../shared/SectionNav.tsx'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'
import { useMe } from '../../auth/session.ts'

const sections = [
  // Every other section lies under Preferences' path, and a key's page counts as API keys.
  { to: '/settings', label: 'Preferences', icon: <SlidersIcon />, exact: true },
  { to: '/settings/api-keys', label: 'API keys', icon: <KeyIcon /> },
  { to: '/settings/plugins', label: 'Plugins', icon: <PuzzleIcon /> },
  { to: '/settings/sync', label: 'Sync', icon: <SyncIcon /> },
] as const

const admin = [{ to: '/admin', label: 'Admin', icon: <ShieldIcon /> }] as const

interface Props {
  children: ReactNode
}

/** The settings sidebar around the current section, with a way into the admin area for admins. */
export function SettingsLayout(props: Props) {
  const me = useMe()
  return (
    <SidebarLayout
      kind="settings"
      nav={
        <>
          <NavHeader title="Settings" />
          <SectionNav sections={sections} activeOptions={{}} />
          {me.admin && <SectionNav sections={admin} activeOptions={{ exact: true }} apart />}
        </>
      }
    >
      {props.children}
    </SidebarLayout>
  )
}
