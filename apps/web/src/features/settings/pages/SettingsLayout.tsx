import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { messageOf } from '../../../shared/errors.ts'
import { useSignOut } from '../../auth/hooks/useSignOut.ts'
import { useMe } from '../../auth/session.tsx'

const sections = [
  { to: '/settings', label: 'Preferences' },
  { to: '/settings/api-keys', label: 'API keys' },
  { to: '/settings/plugins', label: 'Plugins' },
  { to: '/settings/sync', label: 'Sync' },
] as const

/** The settings sidebar around the current section. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const signOut = useMutation({ mutationFn: useSignOut() })
  const { admin } = useMe()
  return (
    <div className="layout settings">
      <nav className="sidebar">
        <Link to="/" activeOptions={{ exact: true }}>
          Back to chats
        </Link>
        {admin && <Link to="/admin">Admin</Link>}
        <ul>
          {sections.map((section) => (
            <li key={section.to}>
              <Link to={section.to} activeOptions={{ exact: true }}>
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => signOut.mutate()}>
          Sign out
        </button>
        {signOut.error && <p role="alert">{messageOf(signOut.error)}</p>}
      </nav>
      <main>{children}</main>
    </div>
  )
}
