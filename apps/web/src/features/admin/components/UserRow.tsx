import { LocalTime } from '../../../shared/LocalTime.tsx'
import type { UserActions } from '../hooks/useUserActions.ts'
import type { AdminUser } from '../queries.ts'
import { SuspendControl } from './SuspendControl.tsx'

interface Props {
  user: AdminUser
  /** The roles the account can be added to. */
  assignable: string[]
  actions: UserActions
}

/** An account: who it is, its roles, when it was last active, and what an admin can do to it. */
export function UserRow(props: Props) {
  const user = props.user
  const name = user.handle ?? user.did
  return (
    <tr>
      <td>
        {user.handle ?? ''}
        {user.viewerOnly && ' (viewer)'}
      </td>
      <td>{user.did}</td>
      <td>{user.storageMode}</td>
      <td>
        {user.roles.map((grant) => (
          <span key={`${grant.role}:${grant.source}`}>
            {grant.role} ({grant.source}){' '}
            {grant.source === 'member' && (
              <button
                type="button"
                onClick={() => props.actions.removeFromRole(grant.role, user.did)}
              >
                Remove
              </button>
            )}{' '}
          </span>
        ))}
      </td>
      <td>
        <time dateTime={user.lastActiveAt}>
          <LocalTime date={user.lastActiveAt} />
        </time>
      </td>
      <td>
        <select
          aria-label={`Add ${name} to a role`}
          // Always shows the prompt: picking a role adds the account to it.
          value=""
          onChange={(e) => e.target.value && props.actions.addToRole(e.target.value, user.did)}
        >
          <option value="">Choose a role</option>
          {props.assignable.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </td>
      <td>
        <SuspendControl
          name={name}
          suspension={user.suspension}
          onSuspend={(reason) => props.actions.suspend(user.did, reason)}
          onRestore={() => props.actions.restore(user.did)}
        />
      </td>
    </tr>
  )
}
