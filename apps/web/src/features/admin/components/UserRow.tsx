import { ClientOnly } from '@tanstack/react-router'
import { CloseIcon } from '../../../shared/icons.tsx'
import { timeAgo } from '../../../shared/time.ts'
import { Badge, Chip } from '../../../shared/ui/Badge.tsx'
import { Item, ItemMark, ItemNames } from '../../../shared/ui/ItemList.tsx'
import type { UserActions } from '../hooks/useUserActions.ts'
import type { AdminUser } from '../queries.ts'
import { SuspendControl } from './SuspendControl.tsx'

interface Props {
  user: AdminUser
  /** The roles the account can be added to. */
  assignable: string[]
  actions: UserActions
}

/**
 * An account: its initial, its handle over its DID, storage, and when it was last active, its roles
 * as chips with a way to add one, and its access at the end.
 */
export function UserRow(props: Props) {
  const user = props.user
  const name = user.handle ?? user.did
  return (
    <Item className="items-start">
      <ItemMark initial>{user.handle?.slice(0, 1).toUpperCase()}</ItemMark>
      <ItemNames
        className="min-w-48 gap-0.5"
        title={
          <>
            {user.handle ?? 'No handle'}{' '}
            {user.viewerOnly && <Badge title="Can only view chats shared with them">Viewer</Badge>}
          </>
        }
        details={[
          <code key="did" className="inline-block max-w-52 truncate align-bottom">
            {user.did}
          </code>,
          user.storageMode === 'local' ? 'On this server' : 'On their PDS',
          // In the browser's locale and time zone, which the server rendering the page lacks.
          <ClientOnly key="active">
            <time dateTime={user.lastActiveAt} title={new Date(user.lastActiveAt).toLocaleString()}>
              Last active {timeAgo(new Date(user.lastActiveAt))}
            </time>
          </ClientOnly>,
        ]}
      >
        <span className="mt-1.5 flex flex-wrap items-center gap-1.25">
          {user.roles.map((grant) => (
            <Chip
              key={`${grant.role}:${grant.source}`}
              title={grant.source === 'member' ? 'Added by an admin' : `From ${grant.source}`}
            >
              {grant.role}
              {grant.source !== 'member' && (
                <span className="font-normal text-muted">{grant.source}</span>
              )}
              {grant.source === 'member' && (
                <button
                  type="button"
                  aria-label={`Remove ${name} from ${grant.role}`}
                  className="-me-1 inline-flex cursor-pointer rounded-small p-0.5 text-muted hover:bg-hover hover:text-danger"
                  onClick={() => props.actions.removeFromRole(grant.role, user.did)}
                >
                  <CloseIcon className="size-3" />
                </button>
              )}
            </Chip>
          ))}
          <select
            aria-label={`Add ${name} to a role`}
            className="cursor-pointer rounded-badge border border-line border-dashed bg-transparent px-1.5 py-px text-caption text-muted hover:text-ink"
            // Always shows the prompt: picking a role adds the account to it.
            value=""
            onChange={(e) => e.target.value && props.actions.addToRole(e.target.value, user.did)}
          >
            <option value="">Add role…</option>
            {props.assignable.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
        </span>
      </ItemNames>
      <SuspendControl
        name={name}
        suspension={user.suspension}
        onSuspend={(reason) => props.actions.suspend(user.did, reason)}
        onRestore={() => props.actions.restore(user.did)}
      />
    </Item>
  )
}
