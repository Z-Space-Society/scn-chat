import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Switch, useLocation, useSearchParams } from 'wouter'
import { api, json, read } from '../api.ts'
import { type Schema, SchemaFields } from '../components/SchemaFields.tsx'
import { useAction } from '../components/useAction.ts'
import type { Issue } from '../lib/response.ts'

type Json = Record<string, unknown>
type Capabilities = { vision: boolean; reasoning: boolean; tools: boolean }
type Grant = { role: string; source: string }
type User = {
  did: string
  handle: string | null
  storageMode: string
  viewerOnly: boolean
  suspension: { at: string; by: string | null; reason: string | null } | null
  lastActiveAt: string
  roles: Grant[]
}
type Invite = { did: string; handle: string | null; addedBy: string; addedAt: string }
type Registration = 'open' | 'invite' | 'closed'
type Member = { did: string; handle: string | null; addedBy: string }
type Role = {
  name: string
  description: string
  builtIn: boolean
  pdsHosts: string[]
  handleDomains: string[]
  members: Member[]
}
type Provider = { id: string; name: string; hasAdminKey: boolean; listsModels: boolean }
type Instance = {
  id: string
  package: string
  name: string | null
  enabled: boolean
  options: Json
  secretFields: string[]
  secretsSet: string[]
  schema: Schema | null
  providers: Provider[]
  status: 'loaded' | 'disabled' | 'failed'
  error: string | null
  issues: Issue[]
}
type Installed = {
  package: string
  description: string | null
  schema: Schema
  secretFields: string[]
  multiple: boolean
}
type AdminModel = {
  provider: string
  id: string
  name: string
  capabilities: Capabilities
  roles: string[]
  default: boolean
  warning?: string | null
}
type Listed = { provider: string; id: string; name: string; capabilities: Capabilities }

const NO_CAPABILITIES: Capabilities = { vision: false, reasoning: false, tools: false }
const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** The roles that exist, for pickers. */
function useRoleNames() {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    read(api.admin.roles.$get())
      .then((body) => setNames(['user', ...(body.roles as Role[]).map((role) => role.name)]))
      .catch((err: unknown) => console.error('Could not load the roles', err))
  }, [])
  return names
}

/** A checkbox for each role, for choosing several. */
function RolePicker({
  names,
  picked,
  onChange,
}: {
  names: string[]
  picked: string[]
  onChange: (roles: string[]) => void
}) {
  return names.map((name) => (
    <label key={name}>
      <input
        type="checkbox"
        checked={picked.includes(name)}
        onChange={(e) =>
          onChange(e.target.checked ? [...picked, name] : picked.filter((role) => role !== name))
        }
      />{' '}
      {name}
    </label>
  ))
}

/** Suspend with a reason, or restore, one account. */
function SuspendControl({
  user,
  change,
}: {
  user: User
  change: (action: () => Promise<unknown>) => void
}) {
  const [reason, setReason] = useState('')
  const name = user.handle ?? user.did
  if (user.suspension)
    return (
      <>
        Suspended by {user.suspension.by}
        {user.suspension.reason && `: ${user.suspension.reason}`}{' '}
        <button
          type="button"
          onClick={() =>
            change(() => read(api.admin.users[':did'].restore.$post({ param: { did: user.did } })))
          }
        >
          Restore
        </button>
      </>
    )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        change(() =>
          read(
            api.admin.users[':did'].suspend.$post(
              { param: { did: user.did } },
              json(reason.trim() ? { reason: reason.trim() } : {}),
            ),
          ),
        )
      }}
    >
      <input
        aria-label={`Reason for suspending ${name}`}
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
  const [invites, setInvites] = useState<Invite[]>([])
  const [identifier, setIdentifier] = useState('')
  const { error, run } = useAction()
  const reload = useCallback(
    () => run(async () => setInvites((await read(api.admin.invites.$get())).invites as Invite[])),
    [run],
  )
  useEffect(reload, [reload])
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await read(api.admin.users.$post({}, json({ identifier })))
            setIdentifier('')
            reload()
          })
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
      {invites.length > 0 && (
        <>
          <h3>Added, not signed in yet</h3>
          <ul>
            {invites.map((invite) => (
              <li key={invite.did}>
                {invite.handle ? `${invite.handle} ` : ''}
                {invite.did}{' '}
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await read(api.admin.invites[':did'].$delete({ param: { did: invite.did } }))
                      reload()
                    })
                  }
                >
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

function Users() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const roleNames = useRoleNames().filter((name) => name !== 'user')
  const { error, run } = useAction()
  const load = useCallback(
    (q: string, from?: string) =>
      run(async () => {
        const body = await read(
          api.admin.users.$get({ query: { q, ...(from ? { cursor: from } : {}) } }),
        )
        setUsers((current) => [...(from ? current : []), ...(body.users as User[])])
        setCursor(body.cursor)
      }),
    [run],
  )
  useEffect(() => load(''), [load])
  const change = (action: () => Promise<unknown>) =>
    run(async () => {
      await action()
      load(query)
    })
  return (
    <section>
      <h2>Users</h2>
      <Invites />
      <h3>Accounts</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          load(query)
        }}
      >
        <input
          aria-label="Search users"
          placeholder="Handle or DID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
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
          {users.map((user) => (
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
                        onClick={() =>
                          change(() =>
                            read(
                              api.admin.roles[':name'].members[':did'].$delete({
                                param: { name: grant.role, did: user.did },
                              }),
                            ),
                          )
                        }
                      >
                        Remove
                      </button>
                    )}{' '}
                  </span>
                ))}
              </td>
              <td>{new Date(user.lastActiveAt).toLocaleString()}</td>
              <td>
                <select
                  aria-label={`Add ${user.handle ?? user.did} to a role`}
                  value=""
                  onChange={(e) => {
                    const name = e.target.value
                    if (!name) return
                    change(() =>
                      read(
                        api.admin.roles[':name'].members.$post(
                          { param: { name } },
                          json({ identifier: user.did }),
                        ),
                      ),
                    )
                  }}
                >
                  <option value="">Choose a role</option>
                  {roleNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </td>
              <td>
                <SuspendControl user={user} change={change} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cursor && (
        <button type="button" onClick={() => load(query, cursor)}>
          Load more
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

/** Every role, and the admins from the environment, who belong to `admin` without being stored. */
function useRoles() {
  const [roles, setRoles] = useState<Role[] | null>(null)
  const [environmentAdmins, setEnvironmentAdmins] = useState<string[]>([])
  const { error, run } = useAction()
  const reload = useCallback(
    () =>
      run(async () => {
        const body = await read(api.admin.roles.$get())
        setRoles(body.roles as Role[])
        setEnvironmentAdmins(body.environmentAdmins)
      }),
    [run],
  )
  useEffect(reload, [reload])
  return { roles, environmentAdmins, error, run, reload }
}

/** One role's description, matching rules, and explicit members. */
function RoleForm({
  role,
  environmentAdmins,
  reload,
  removed,
}: {
  role: Role
  environmentAdmins: string[]
  reload: () => void
  removed: () => void
}) {
  const [description, setDescription] = useState(role.description)
  const [hosts, setHosts] = useState(role.pdsHosts.join('\n'))
  const [domains, setDomains] = useState(role.handleDomains.join('\n'))
  const [identifier, setIdentifier] = useState('')
  const [saved, setSaved] = useState(false)
  const { error, run } = useAction()
  const name = role.name
  const then = (action: () => Promise<unknown>) =>
    run(async () => {
      await action()
      reload()
    })
  return (
    <section>
      <h2>{name}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSaved(false)
          then(async () => {
            await read(
              api.admin.roles[':name'].$patch(
                { param: { name } },
                json({ description, pdsHosts: lines(hosts), handleDomains: lines(domains) }),
              ),
            )
            setSaved(true)
          })
        }}
      >
        <label>
          Description <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          PDS hosts, one per line
          <textarea value={hosts} onChange={(e) => setHosts(e.target.value)} />
        </label>
        <label>
          Handle domains, one per line
          <textarea value={domains} onChange={(e) => setDomains(e.target.value)} />
        </label>
        <button type="submit">Save</button>
        {saved && <span>Saved.</span>}
      </form>
      <h3>Members</h3>
      <ul>
        {name === 'admin' &&
          environmentAdmins.map((did) => <li key={did}>{did} (from ADMIN_DIDS)</li>)}
        {role.members.map((member) => (
          <li key={member.did}>
            {member.handle ? `${member.handle} ` : ''}
            {member.did} (added by {member.addedBy}){' '}
            <button
              type="button"
              onClick={() =>
                then(() =>
                  read(
                    api.admin.roles[':name'].members[':did'].$delete({
                      param: { name, did: member.did },
                    }),
                  ),
                )
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          then(async () => {
            await read(
              api.admin.roles[':name'].members.$post({ param: { name } }, json({ identifier })),
            )
            setIdentifier('')
          })
        }}
      >
        <input
          aria-label={`Add a member to ${name}`}
          placeholder="Handle or DID"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <button type="submit">Add member</button>
      </form>
      {!role.builtIn && (
        <button
          type="button"
          onClick={() =>
            run(async () => {
              await read(api.admin.roles[':name'].$delete({ param: { name } }))
              removed()
            })
          }
        >
          Delete role
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

/** One role on its own page. */
function RolePage({ name }: { name: string }) {
  const [, navigate] = useLocation()
  const { roles, environmentAdmins, error, reload } = useRoles()
  const role = roles?.find((candidate) => candidate.name === name)
  return (
    <>
      <Link href="/roles">Back to roles</Link>
      {role ? (
        <RoleForm
          key={JSON.stringify(role)}
          role={role}
          environmentAdmins={environmentAdmins}
          reload={reload}
          removed={() => navigate('/roles')}
        />
      ) : (
        roles && <p role="alert">This role doesn't exist.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

/** A summary of every role, each linking to its page, and a form to create one. */
function Roles() {
  const [, navigate] = useLocation()
  const { roles, environmentAdmins, error, run } = useRoles()
  const [draft, setDraft] = useState({ name: '', description: '' })
  return (
    <section>
      <h2>Roles</h2>
      <p>
        Everyone who has signed in holds the <code>user</code> role. A role's members are the people
        added to it, plus everyone whose PDS host or handle domain matches.
      </p>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Description</th>
            <th>Members</th>
            <th>PDS hosts</th>
            <th>Handle domains</th>
          </tr>
        </thead>
        <tbody>
          {(roles ?? []).map((role) => (
            <tr key={role.name}>
              <td>
                <Link href={`/roles/${role.name}`}>{role.name}</Link>
              </td>
              <td>{role.description}</td>
              <td>
                {role.members.length + (role.name === 'admin' ? environmentAdmins.length : 0)}
              </td>
              <td>{role.pdsHosts.join(', ')}</td>
              <td>{role.handleDomains.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await read(api.admin.roles.$post({}, json(draft)))
            navigate(`/roles/${draft.name}`)
          })
        }}
      >
        <h3>New role</h3>
        <input
          aria-label="Role name"
          placeholder="name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          required
        />
        <input
          aria-label="Role description"
          placeholder="Description"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        <button type="submit">Create role</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

const MODES: { mode: Registration; label: string }[] = [
  { mode: 'open', label: 'Open: anyone with an atproto account can create an account.' },
  {
    mode: 'invite',
    label: 'Invite: members of the roles below, and people added on the Users page.',
  },
  { mode: 'closed', label: 'Closed: only people added on the Users page.' },
]

function Access() {
  const names = useRoleNames().filter((name) => name !== 'user')
  const [access, setAccess] = useState<{
    registration: Registration
    inviteRoles: string[]
  } | null>(null)
  const [saved, setSaved] = useState(false)
  const { error, run } = useAction()
  useEffect(() => {
    run(async () => setAccess(await read(api.admin.access.$get())))
  }, [run])
  if (!access) return error ? <p role="alert">{error}</p> : null
  return (
    <section>
      <h2>Access</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSaved(false)
          run(async () => {
            await read(api.admin.access.$put({}, json(access)))
            setSaved(true)
          })
        }}
      >
        <p>
          Who can create an account. People who already have one keep it, until you suspend them on
          the Users page. Admins can always sign in, and anyone can sign in from a share link to
          view a chat shared with them.
        </p>
        {MODES.map(({ mode, label }) => (
          <label key={mode}>
            <input
              type="radio"
              name="registration"
              checked={access.registration === mode}
              onChange={() => setAccess({ ...access, registration: mode })}
            />{' '}
            {label}
          </label>
        ))}
        {access.registration === 'invite' && (
          <fieldset>
            <legend>Invite roles</legend>
            <RolePicker
              names={names}
              picked={access.inviteRoles}
              onChange={(inviteRoles) => setAccess({ ...access, inviteRoles })}
            />
          </fieldset>
        )}
        <button type="submit">Save</button>
        {saved && <span>Saved.</span>}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

const CAPABILITIES = ['vision', 'reasoning', 'tools'] as const

/** A model's page. Model IDs can hold slashes and colons, so they go in the query string. */
const modelHref = (instanceId: string, model: AdminModel) =>
  `/plugins/${instanceId}/model?${new URLSearchParams({ provider: model.provider, id: model.id })}`

/** A summary of a provider's admin models, and the ways to add more. */
function ProviderModels({
  instance,
  options,
  provider,
  models,
  reload,
}: {
  instance: Instance
  options: Json
  provider: Provider
  models: AdminModel[]
  reload: () => void
}) {
  const [listed, setListed] = useState<Listed[]>([])
  const [typed, setTyped] = useState('')
  const { error, run } = useAction()
  const offered = new Set(models.map((model) => model.id))
  const offer = (id: string, name: string, capabilities: Capabilities) =>
    run(async () => {
      await read(
        api.admin.models.$post(
          {},
          json({ provider: provider.id, id, name, capabilities, roles: ['user'], default: false }),
        ),
      )
      reload()
    })
  return (
    <div>
      <h3>Models for {provider.name}</h3>
      {!provider.hasAdminKey && <p>Add an admin key to offer this provider's models.</p>}
      {models.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>ID</th>
              <th>Capabilities</th>
              <th>Roles</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id}>
                <td>
                  <Link href={modelHref(instance.id, model)}>{model.name}</Link>
                </td>
                <td>{model.id}</td>
                <td>{CAPABILITIES.filter((c) => model.capabilities[c]).join(', ')}</td>
                <td>{model.roles.join(', ')}</td>
                <td>{model.default ? 'Yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {provider.listsModels && (
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const body = await read(
                api.admin.plugins['list-models'].$post(
                  {},
                  json({ package: instance.package, instanceId: instance.id, options }),
                ),
              )
              setListed((body.models as Listed[]).filter((m) => m.provider === provider.id))
            })
          }
        >
          Refresh model list
        </button>
      )}
      {listed.length > 0 && (
        <ul>
          {listed.map((model) => (
            <li key={model.id}>
              <label>
                <input
                  type="checkbox"
                  checked={offered.has(model.id)}
                  disabled={offered.has(model.id) || !provider.hasAdminKey}
                  onChange={() => offer(model.id, model.name, model.capabilities)}
                />{' '}
                {model.name} ({model.id})
              </label>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          offer(typed.trim(), typed.trim(), NO_CAPABILITIES)
          setTyped('')
        }}
      >
        <input
          aria-label={`Model ID for ${provider.name}`}
          placeholder="Model ID"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          required
        />
        <button type="submit" disabled={!provider.hasAdminKey}>
          Add model
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

/** One admin model's name, capabilities, and roles. */
function ModelForm({
  model,
  roleNames,
  reload,
  removed,
}: {
  model: AdminModel
  roleNames: string[]
  reload: () => void
  removed: () => void
}) {
  const { warning: _warning, ...stored } = model
  const [draft, setDraft] = useState(stored)
  const [saved, setSaved] = useState(false)
  const { error, run } = useAction()
  const key = { provider: model.provider, id: model.id }
  return (
    <section>
      <h2>{model.name}</h2>
      <p>
        <code>
          {model.provider}/{model.id}
        </code>
      </p>
      {model.warning && <p role="alert">{model.warning}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSaved(false)
          run(async () => {
            await read(api.admin.models.$put({}, json(draft)))
            setSaved(true)
            reload()
          })
        }}
      >
        <label>
          Name{' '}
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Capabilities</legend>
          {CAPABILITIES.map((capability) => (
            <label key={capability}>
              <input
                type="checkbox"
                checked={draft.capabilities[capability]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    capabilities: { ...draft.capabilities, [capability]: e.target.checked },
                  })
                }
              />{' '}
              {capability}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Roles</legend>
          <RolePicker
            names={roleNames}
            picked={draft.roles}
            onChange={(roles) => setDraft({ ...draft, roles })}
          />
        </fieldset>
        <button type="submit">Save</button>{' '}
        <button
          type="button"
          onClick={() =>
            run(async () => {
              await read(api.admin.models.$delete({}, json(key)))
              removed()
            })
          }
        >
          Remove model
        </button>
        {saved && <span>Saved.</span>}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

/** One of a plugin's admin models on its own page. */
function ModelPage({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const [params] = useSearchParams()
  const { instances, models, version, roleNames, error, reload } = usePlugins()
  const model = models.find(
    (candidate) =>
      candidate.provider === params.get('provider') && candidate.id === params.get('id'),
  )
  return (
    <>
      <Link href={`/plugins/${id}`}>Back to plugin</Link>
      {model ? (
        <ModelForm
          key={version}
          model={model}
          roleNames={roleNames}
          reload={reload}
          removed={() => navigate(`/plugins/${id}`)}
        />
      ) : (
        instances && <p role="alert">This model isn't offered.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

/** The plugins, installed packages, admin models, and role names the plugin pages need. */
function usePlugins() {
  const [instances, setInstances] = useState<Instance[] | null>(null)
  const [installed, setInstalled] = useState<Installed[]>([])
  const [models, setModels] = useState<AdminModel[]>([])
  // Remount forms after each reload, so their drafts start from what the server stored.
  const [version, setVersion] = useState(0)
  const roleNames = useRoleNames()
  const { error, run } = useAction()
  const reload = useCallback(
    () =>
      run(async () => {
        const [list, packages, adminModels] = await Promise.all([
          read(api.admin.plugins.$get()),
          read(api.admin.plugins.installed.$get()),
          read(api.admin.models.$get()),
        ])
        setInstances(list.instances as Instance[])
        setInstalled(packages.plugins as Installed[])
        setModels(adminModels.models as AdminModel[])
        setVersion((current) => current + 1)
      }),
    [run],
  )
  useEffect(reload, [reload])
  return { instances, installed, models, version, roleNames, error, run, reload }
}

/** One plugin's options, provider models, enabled switch, and removal. */
function PluginForm({
  instance,
  models,
  reload,
  removed,
}: {
  instance: Instance
  models: AdminModel[]
  reload: () => void
  removed: () => void
}) {
  const [options, setOptions] = useState<Json>(instance.options)
  const [enabled, setEnabled] = useState(instance.enabled)
  const [cleared, setCleared] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const { error, issues, run } = useAction()
  const id = instance.id
  // Options the plugin no longer has are dropped, so a save after an upgrade clears them.
  const known = (values: Json) =>
    Object.fromEntries(
      Object.entries(values).filter(([key]) => key in (instance.schema?.properties ?? values)),
    )
  return (
    <section>
      <h2>{instance.name ?? instance.package}</h2>
      <p>
        <code>{instance.package}</code>: {instance.status}
      </p>
      {instance.error && <p role="alert">{instance.error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSaved(false)
          run(async () => {
            await read(
              api.admin.plugins[':id'].$put(
                { param: { id } },
                json({ options: known(options), enabled, clearSecrets: cleared }),
              ),
            )
            setSaved(true)
            reload()
          })
        }}
      >
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{' '}
          Enabled
        </label>
        {instance.schema && (
          <SchemaFields
            schema={instance.schema}
            values={options}
            secretFields={instance.secretFields}
            secretsSet={instance.secretsSet}
            cleared={cleared}
            onClear={(key, clear) =>
              setCleared((current) =>
                clear ? [...current, key] : current.filter((field) => field !== key),
              )
            }
            issues={issues.length ? issues : instance.issues}
            onChange={(key, value) => setOptions((current) => ({ ...current, [key]: value }))}
          />
        )}
        <button type="submit">Save</button>{' '}
        <button
          type="button"
          onClick={() =>
            run(async () => {
              await read(api.admin.plugins[':id'].$delete({ param: { id } }))
              removed()
            })
          }
        >
          Remove plugin
        </button>
        {saved && <span>Saved.</span>}
      </form>
      {error && <p role="alert">{error}</p>}
      {instance.providers.map((provider) => (
        <ProviderModels
          key={provider.id}
          instance={instance}
          options={options}
          provider={provider}
          models={models.filter((model) => model.provider === provider.id)}
          reload={reload}
        />
      ))}
    </section>
  )
}

/** One plugin on its own page. */
function PluginPage({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { instances, models, version, error, reload } = usePlugins()
  const instance = instances?.find((candidate) => candidate.id === id)
  return (
    <>
      <Link href="/plugins">Back to plugins</Link>
      {instance ? (
        <PluginForm
          key={version}
          instance={instance}
          models={models}
          reload={reload}
          removed={() => navigate('/plugins')}
        />
      ) : (
        instances && <p role="alert">This plugin isn't configured.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

/** Pick an installed package, fill in its options, and add it. */
function NewPlugin() {
  const [, navigate] = useLocation()
  const { instances, installed } = usePlugins()
  const [picked, setPicked] = useState('')
  const [options, setOptions] = useState<Json>({})
  const { error, issues, run } = useAction()
  const added = new Set((instances ?? []).map((instance) => instance.package))
  const available = installed.filter((p) => p.multiple || !added.has(p.package))
  const plugin = available.find((p) => p.package === picked)
  return (
    <>
      <Link href="/plugins">Back to plugins</Link>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            const { id } = await read(
              api.admin.plugins.$post({}, json({ package: picked, options })),
            )
            navigate(`/plugins/${id}`)
          })
        }}
      >
        <h2>Add plugin</h2>
        <select
          aria-label="Plugin package"
          value={picked}
          onChange={(e) => {
            setPicked(e.target.value)
            setOptions({})
          }}
          required
        >
          <option value="">Choose a plugin</option>
          {available.map((p) => (
            <option key={p.package} value={p.package}>
              {p.package}
            </option>
          ))}
        </select>
        {plugin?.description && <p>{plugin.description}</p>}
        {plugin && (
          <SchemaFields
            schema={plugin.schema}
            values={options}
            secretFields={plugin.secretFields}
            issues={issues}
            onChange={(key, value) => setOptions((current) => ({ ...current, [key]: value }))}
          />
        )}
        <button type="submit">Add</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </>
  )
}

/** Every configured plugin in load order, each linking to its page. */
function PluginList() {
  const { instances, error, run, reload } = usePlugins()
  const move = (index: number, by: number) =>
    run(async () => {
      const ids = (instances ?? []).map((instance) => instance.id)
      const [moved] = ids.splice(index, 1)
      ids.splice(index + by, 0, moved as string)
      await read(api.admin.plugins.order.$put({}, json({ ids })))
      reload()
    })
  return (
    <section>
      <h2>Plugins</h2>
      <p>Plugins load in this order, which is also the order their hooks run in.</p>
      {instances?.length === 0 && <p>No plugins yet.</p>}
      <ol>
        {(instances ?? []).map((instance, index) => (
          <li key={instance.id}>
            <Link href={`/plugins/${instance.id}`}>{instance.name ?? instance.package}</Link>{' '}
            <code>{instance.package}</code> {instance.status}{' '}
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
              Up
            </button>{' '}
            <button
              type="button"
              disabled={index === (instances ?? []).length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </button>
            {instance.error && <p role="alert">{instance.error}</p>}
          </li>
        ))}
      </ol>
      <Link href="/plugins/new">Add plugin</Link>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

function Models() {
  const [models, setModels] = useState<AdminModel[]>([])
  const { error, run } = useAction()
  const reload = useCallback(
    () => run(async () => setModels((await read(api.admin.models.$get())).models as AdminModel[])),
    [run],
  )
  useEffect(reload, [reload])
  const change = (action: () => Promise<unknown>) =>
    run(async () => {
      await action()
      reload()
    })
  const move = (index: number, by: number) => {
    const order = models.map(({ provider, id }) => ({ provider, id }))
    const [moved] = order.splice(index, 1)
    order.splice(index + by, 0, moved as { provider: string; id: string })
    change(() => read(api.admin.models.order.$put({}, json({ models: order }))))
  }
  return (
    <section>
      <h2>Models</h2>
      <p>
        Models are added on their provider's plugin page, under <Link href="/plugins">Plugins</Link>
        . Here you set the default and the order users see them in.
      </p>
      <ol>
        {models.map((model, index) => (
          <li key={`${model.provider}/${model.id}`}>
            <label>
              <input
                type="radio"
                name="default-model"
                checked={model.default}
                onChange={() => {
                  const { warning: _warning, ...body } = model
                  change(() => read(api.admin.models.$put({}, json({ ...body, default: true }))))
                }}
              />{' '}
              {model.name} ({model.provider}/{model.id})
            </label>{' '}
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
              Up
            </button>{' '}
            <button
              type="button"
              disabled={index === models.length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </button>
            {model.warning && <p role="alert">{model.warning}</p>}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

type SettingGroup = { key: string; schema: Schema; value: Json }

/** Forms for some of the app's own settings, with one Save. */
function SettingsForm({ title, keys }: { title: string; keys: string[] }) {
  const [groups, setGroups] = useState<SettingGroup[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Json>>({})
  const [failed, setFailed] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { error, issues, run } = useAction()
  useEffect(() => {
    run(async () => {
      const body = await read(api.admin.settings.$get())
      const picked = (body.settings as SettingGroup[]).filter((group) => keys.includes(group.key))
      setGroups(picked)
      setDrafts(Object.fromEntries(picked.map((group) => [group.key, group.value])))
    })
  }, [run, keys])
  if (!groups) return error ? <p role="alert">{error}</p> : null
  return (
    <section>
      <h2>{title}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSaved(false)
          run(async () => {
            for (const group of groups) {
              setFailed(group.key)
              await read(
                api.admin.settings[':key'].$put(
                  { param: { key: group.key } },
                  json(drafts[group.key]),
                ),
              )
            }
            setFailed(null)
            setSaved(true)
          })
        }}
      >
        {groups.map((group) => (
          <fieldset key={group.key}>
            <SchemaFields
              schema={group.schema}
              values={drafts[group.key] ?? {}}
              issues={failed === group.key ? issues : []}
              onChange={(field, value) =>
                setDrafts((current) => ({
                  ...current,
                  [group.key]: { ...current[group.key], [field]: value },
                }))
              }
            />
          </fieldset>
        ))}
        <button type="submit">Save</button>
        {saved && <span>Saved.</span>}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

type ApiKey = {
  id: string
  label: string
  roles: string[]
  createdAt: string
  lastUsedAt: string | null
}

/** Issue and revoke the keys that scripts, such as a crontab, send as a Bearer token. */
function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [draft, setDraft] = useState({ label: '', roles: [] as string[] })
  const [issued, setIssued] = useState<string | null>(null)
  const roleNames = useRoleNames()
  const { error, run } = useAction()
  const reload = useCallback(
    () => run(async () => setKeys((await read(api.admin['api-keys'].$get())).keys as ApiKey[])),
    [run],
  )
  useEffect(reload, [reload])
  return (
    <section>
      <h2>API keys</h2>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Roles</th>
            <th>Created</th>
            <th>Last used</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>{key.label}</td>
              <td>{key.roles.join(', ')}</td>
              <td>{new Date(key.createdAt).toLocaleString()}</td>
              <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</td>
              <td>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await read(api.admin['api-keys'][':id'].$delete({ param: { id: key.id } }))
                      reload()
                    })
                  }
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            const body = await read(api.admin['api-keys'].$post({}, json(draft)))
            setIssued(body.key)
            setDraft({ label: '', roles: [] })
            reload()
          })
        }}
      >
        <h3>New key</h3>
        <input
          aria-label="Key label"
          placeholder="Label"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          required
        />
        <fieldset>
          <legend>Roles</legend>
          <RolePicker
            names={roleNames}
            picked={draft.roles}
            onChange={(roles) => setDraft({ ...draft, roles })}
          />
        </fieldset>
        <button type="submit">Issue key</button>
      </form>
      {issued && (
        <p>
          Copy this key now. It can't be shown again: <code>{issued}</code>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

type CronRun = { startedAt: string; finishedAt: string | null; failed: string[] }

const DAY_MS = 86_400_000

/** When cron last ran, and how to set it up. */
function CronStatus() {
  const [lastRun, setLastRun] = useState<CronRun | null | undefined>(undefined)
  const { error, run } = useAction()
  useEffect(() => {
    run(async () => setLastRun((await read(api.admin.cron.$get())).lastRun as CronRun | null))
  }, [run])
  const stale =
    lastRun !== undefined && (!lastRun || Date.now() - Date.parse(lastRun.startedAt) > DAY_MS)
  return (
    <section>
      <h2>Cron</h2>
      {stale && (
        <p role="alert">
          {lastRun ? "Cron hasn't run in over a day." : 'Cron has never run.'} Plugins that work on
          a schedule, such as member lists, aren't being updated.
        </p>
      )}
      {lastRun && (
        <p>
          Last run started {new Date(lastRun.startedAt).toLocaleString()}
          {lastRun.finishedAt
            ? ` and finished ${new Date(lastRun.finishedAt).toLocaleString()}`
            : ' and is still going'}
          .{lastRun.failed.length > 0 && ` Failed: ${lastRun.failed.join(', ')}.`}
        </p>
      )}
      <p>
        Issue a key with the <code>admin</code> role on the <Link href="/api-keys">API keys</Link>{' '}
        page, then call cron on a schedule, for example from a crontab:
      </p>
      <pre>
        {`*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer <key>" ${window.location.origin}/api/cron`}
      </pre>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

const GENERAL = ['general', 'sessions']
const TURNS = ['turns']
const SYNC = ['sync']

const sections = [
  { path: '/users', label: 'Users' },
  { path: '/roles', label: 'Roles' },
  { path: '/access', label: 'Access' },
  { path: '/plugins', label: 'Plugins' },
  { path: '/models', label: 'Models' },
  { path: '/general', label: 'General' },
  { path: '/turns', label: 'Turns' },
  { path: '/sync', label: 'Sync' },
  { path: '/api-keys', label: 'API keys' },
  { path: '/cron', label: 'Cron' },
]

/** The admin area: users, roles, access, plugins, models, and the app's settings. */
export function AdminPage() {
  const [location] = useLocation()
  const current = location === '/' ? '/users' : location
  return (
    <div className="layout settings">
      <nav className="sidebar">
        <Link href="~/">Back to chats</Link>
        <Link href="~/settings">Account settings</Link>
        <ul>
          {sections.map((section) => (
            <li key={section.path}>
              <Link
                href={section.path}
                aria-current={
                  current === section.path || current.startsWith(`${section.path}/`)
                    ? 'page'
                    : undefined
                }
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main>
        <Switch>
          <Route path="/roles/:name">{(params) => <RolePage name={params.name} />}</Route>
          <Route path="/roles">
            <Roles />
          </Route>
          <Route path="/access">
            <Access />
          </Route>
          <Route path="/plugins/new">
            <NewPlugin />
          </Route>
          <Route path="/plugins/:id/model">{(params) => <ModelPage id={params.id} />}</Route>
          <Route path="/plugins/:id">{(params) => <PluginPage id={params.id} />}</Route>
          <Route path="/plugins">
            <PluginList />
          </Route>
          <Route path="/models">
            <Models />
          </Route>
          <Route path="/general">
            <SettingsForm title="General" keys={GENERAL} />
          </Route>
          <Route path="/turns">
            <SettingsForm title="Turns" keys={TURNS} />
          </Route>
          <Route path="/sync">
            <SettingsForm title="Sync" keys={SYNC} />
          </Route>
          <Route path="/api-keys">
            <ApiKeys />
          </Route>
          <Route path="/cron">
            <CronStatus />
          </Route>
          <Route>
            <Users />
          </Route>
        </Switch>
      </main>
    </div>
  )
}
