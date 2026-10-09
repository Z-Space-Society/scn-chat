import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { messageOf } from '../../../shared/errors.ts'
import { SectionNav } from '../../../shared/SectionNav.tsx'
import { SidebarLayout } from '../../../shared/SidebarLayout.tsx'
import { useSignOut } from '../../auth/hooks/useSignOut.ts'
import { useMe } from '../../auth/session.ts'

const sections = [
  { to: '/settings', label: 'Preferences' },
  { to: '/settings/api-keys', label: 'API keys' },
  { to: '/settings/plugins', label: 'Plugins' },
  { to: '/settings/sync', label: 'Sync' },
] as const

interface Props {
  children: ReactNode
}

/** The settings sidebar around the current section. */
export function SettingsLayout(props: Props) {
  const signOut = useSignOut()
  const { admin } = useMe()
  return (
    <SidebarLayout
      nav={
        <>
          <Link to="/" activeOptions={{ exact: true }}>
            Back to chats
          </Link>
          {admin && <Link to="/admin">Admin</Link>}
          <SectionNav sections={sections} activeOptions={{ exact: true }} />
          <button type="button" onClick={() => signOut.mutate()}>
            Sign out
          </button>
          {signOut.error && <p role="alert">{messageOf(signOut.error)}</p>}
        </>
      }
    >
      {props.children}
    </SidebarLayout>
  )
}
