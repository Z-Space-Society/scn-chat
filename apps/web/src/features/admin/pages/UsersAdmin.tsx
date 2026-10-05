import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientOnly, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { adminInvitesQuery, adminRolesQuery, adminUsersQuery } from '../queries.ts'

type Suspension = { at: string; by: string | null; reason: string | null }

interface UsersAdminProps {
  q: string
}

/** Accounts, with their roles and suspensions, and the people added who haven't signed in yet. */
export function UsersAdmin(props: UsersAdminProps) {
  const users = useInfiniteQuery(adminUsersQuery(props.q))
  const roles = useQuery(adminRolesQuery)
  const queryClient = useQueryClient()
  const usersChanged = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  // Explicit members are listed on the roles page too.
  const membersChanged = () =>
    Promise.all([
      usersChanged(),
      queryClient.invalidateQueries({ queryKey: adminRolesQuery.queryKey }),
    ])
  const addToRole = useMutation({
    mutationFn: ({ role, did }: { role: string; did: string }) =>
      read(
        api.admin.roles[':name'].members.$post(
          { param: { name: role } },
          json({ identifier: did }),
        ),
      ),
    onSuccess: membersChanged,
  })
  const removeFromRole = useMutation({
    mutationFn: ({ role, did }: { role: string; did: string }) =>
      read(api.admin.roles[':name'].members[':did'].$delete({ param: { name: role, did } })),
    onSuccess: membersChanged,
  })
  const suspend = useMutation({
    mutationFn: ({ did, reason }: { did: string; reason: string }) =>
      read(
        api.admin.users[':did'].suspend.$post(
          { param: { did } },
          json(reason.trim() ? { reason: reason.trim() } : {}),
        ),
      ),
    onSuccess: usersChanged,
  })
  const restore = useMutation({
    mutationFn: (did: string) => read(api.admin.users[':did'].restore.$post({ param: { did } })),
    onSuccess: usersChanged,
  })
  const roleNames = (roles.data?.roles ?? []).map((role) => role.name)
  const accounts = users.data?.pages.flatMap((page) => page.users) ?? []
  const loadError = users.error ?? roles.error
  const error =
    lastError(addToRole, removeFromRole, suspend, restore) ?? (loadError && messageOf(loadError))
  return (
    <section>
      <h2>Users</h2>
      <Invites />
      <h3>Accounts</h3>
      <UserSearch q={props.q} />
      <table>
        <thead>
          <tr>
            <th>Handle</th>
            <th>DID</th>
            <th>Storage</th>
            <th>Roles</th>
            <th>Last active</th>
            <th>Add to role</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((user) => (
            <tr key={user.did}>
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
                        onClick={() => removeFromRole.mutate({ role: grant.role, did: user.did })}
                      >
                        Remove
                      </button>
                    )}{' '}
                  </span>
                ))}
              </td>
              <td>
                {/* In the browser's locale and time zone, which the server rendering the page lacks. */}
                <time dateTime={user.lastActiveAt}>
                  <ClientOnly>{new Date(user.lastActiveAt).toLocaleString()}</ClientOnly>
                </time>
              </td>
              <td>
                <select
                  aria-label={`Add ${user.handle ?? user.did} to a role`}
                  value=""
                  onChange={(e) =>
                    e.target.value && addToRole.mutate({ role: e.target.value, did: user.did })
                  }
                >
                  <option value="">Choose a role</option>
                  {roleNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </td>
              <td>
                <SuspendControl
                  name={user.handle ?? user.did}
                  suspension={user.suspension}
                  onSuspend={(reason) => suspend.mutate({ did: user.did, reason })}
                  onRestore={() => restore.mutate(user.did)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.hasNextPage && (
        <button type="button" onClick={() => void users.fetchNextPage()}>
          Load more
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

interface UserSearchProps {
  q: string
}

/** The search box, which follows the URL's `q` when it changes, as when the sidebar link clears it. */
function UserSearch(props: UserSearchProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState(props.q)
  // Updated while rendering rather than by remounting, so the box keeps focus after a search.
  const [shownQ, setShownQ] = useState(props.q)
  if (props.q !== shownQ) {
    setShownQ(props.q)
    setSearch(props.q)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = search.trim()
        void navigate({
          to: '/admin/users',
          search: trimmed ? { q: trimmed } : {},
          replace: true,
        })
      }}
    >
      <input
        aria-label="Search users"
        placeholder="Handle or DID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  )
}

interface SuspendControlProps {
  name: string
  suspension: Suspension | null
  onSuspend: (reason: string) => void
  onRestore: () => void
}

function SuspendControl(props: SuspendControlProps) {
  const [reason, setReason] = useState('')
  if (props.suspension)
    return (
      <>
        Suspended by {props.suspension.by}
        {props.suspension.reason && `: ${props.suspension.reason}`}{' '}
        <button type="button" onClick={props.onRestore}>
          Restore
        </button>
      </>
    )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        props.onSuspend(reason)
      }}
    >
      <input
        aria-label={`Reason for suspending ${props.name}`}
        placeholder="Reason, seen only by admins"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button type="submit">Suspend</button>
    </form>
  )
}

/** People an admin added who haven't signed in yet, and a form to add more. */
function Invites() {
  const invites = useQuery(adminInvitesQuery)
  const queryClient = useQueryClient()
  const [identifier, setIdentifier] = useState('')
  const reload = () => queryClient.invalidateQueries({ queryKey: adminInvitesQuery.queryKey })
  const add = useMutation({
    mutationFn: (identifier: string) => read(api.admin.users.$post({}, json({ identifier }))),
    onSuccess: () => {
      setIdentifier('')
      return reload()
    },
  })
  const remove = useMutation({
    mutationFn: (did: string) => read(api.admin.invites[':did'].$delete({ param: { did } })),
    onSuccess: reload,
  })
  const error = lastError(add, remove) ?? (invites.error && messageOf(invites.error))
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate(identifier)
        }}
      >
        <h3>Add user</h3>
        <p>They can create an account whatever the registration mode is.</p>
        <input
          aria-label="Add a user"
          placeholder="Handle or DID"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <button type="submit">Add user</button>
      </form>
      {!!invites.data?.length && (
        <>
          <h3>Added, not signed in yet</h3>
          <ul>
            {invites.data.map((invite) => (
              <li key={invite.did}>
                {invite.handle ? `${invite.handle} ` : ''}
                {invite.did}{' '}
                <button type="button" onClick={() => remove.mutate(invite.did)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
