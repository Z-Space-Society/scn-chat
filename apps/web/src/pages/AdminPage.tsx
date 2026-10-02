import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Switch, useLocation } from 'wouter'
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
type Member = { did: string; handle: string | null }
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

function RoleBlock({
  role,
  environmentAdmins,
  reload,
}: {
  role: Role
  environmentAdmins: string[]
  reload: () => void
}) {
  const [description, setDescription] = useState(role.description)
  const [hosts, setHosts] = useState(role.pdsHosts.join('\n'))
  const [domains, setDomains] = useState(role.handleDomains.join('\n'))
  const [identifier, setIdentifier] = useState('')
  const { error, run } = useAction()
  const name = role.name
  const then = (action: () => Promise<unknown>) =>
    run(async () => {
      await action()
      reload()
    })
  return (
    <fieldset>
      <legend>{name}</legend>
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
      <button
        type="button"
        onClick={() =>
          then(() =>
            read(
              api.admin.roles[':name'].$patch(
                { param: { name } },
                json({ description, pdsHosts: lines(hosts), handleDomains: lines(domains) }),
              ),
            ),
          )
        }
      >
        Save
      </button>
      <h4>Members</h4>
      <ul>
        {name === 'admin' &&
          environmentAdmins.map((did) => <li key={did}>{did} (from ADMIN_DIDS)</li>)}
        {role.members.map((member) => (
          <li key={member.did}>
            {member.handle ? `${member.handle} ` : ''}
            {member.did}{' '}
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
          onClick={() => then(() => read(api.admin.roles[':name'].$delete({ param: { name } })))}
        >
          Delete role
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}

function Roles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [environmentAdmins, setEnvironmentAdmins] = useState<string[]>([])
  const [draft, setDraft] = useState({ name: '', description: '' })
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
  return (
    <section>
      <h2>Roles</h2>
      <p>
        Everyone who has signed in holds the <code>user</code> role. A role's members are the people
        added here, plus everyone whose PDS host or handle domain matches.
      </p>
      {roles.map((role) => (
        <RoleBlock
          key={`${role.name}:${JSON.stringify(role)}`}
          role={role}
          environmentAdmins={environmentAdmins}
          reload={reload}
        />
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await read(api.admin.roles.$post({}, json(draft)))
            setDraft({ name: '', description: '' })
            reload()
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

/** A provider's admin models, with a model list fetched using the plugin form's current values. */
function ProviderModels({
  instance,
  options,
  provider,
  models,
  roleNames,
  reload,
}: {
  instance: Instance
  options: Json
  provider: Provider
  models: AdminModel[]
  roleNames: string[]
  reload: () => void
}) {
  const [listed, setListed] = useState<Listed[]>([])
  const [typed, setTyped] = useState('')
  const { error, run } = useAction()
  const offered = new Set(models.map((model) => model.id))
  const save = (method: 'post' | 'put', model: AdminModel) =>
    run(async () => {
      const { warning: _warning, ...body } = model
      await read(
        method === 'post'
          ? api.admin.models.$post({}, json(body))
          : api.admin.models.$put({}, json(body)),
      )
      reload()
    })
  const offer = (id: string, name: string, capabilities: Capabilities) =>
    save('post', {
      provider: provider.id,
      id,
      name,
      capabilities,
      roles: ['user'],
      default: false,
    })
  return (
    <div>
      <h4>Models for {provider.name}</h4>
      {!provider.hasAdminKey && <p>Add an admin key to offer this provider's models.</p>}
      <ul>
        {models.map((model) => (
          <li key={model.id}>
            <ModelEditor
              model={model}
              roleNames={roleNames}
              onSave={(changed) => save('put', changed)}
              onRemove={() =>
                run(async () => {
                  await read(
                    api.admin.models.$delete({}, json({ provider: model.provider, id: model.id })),
                  )
                  reload()
                })
              }
            />
          </li>
        ))}
      </ul>
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
function ModelEditor({
  model,
  roleNames,
  onSave,
  onRemove,
}: {
  model: AdminModel
  roleNames: string[]
  onSave: (model: AdminModel) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(model)
  return (
    <fieldset>
      <legend>{model.id}</legend>
      <label>
        Name{' '}
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      {(['vision', 'reasoning', 'tools'] as const).map((capability) => (
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
      <div>
        Roles:{' '}
        <RolePicker
          names={roleNames}
          picked={draft.roles}
          onChange={(roles) => setDraft({ ...draft, roles })}
        />
      </div>
      <button type="button" onClick={() => onSave(draft)}>
        Save model
      </button>{' '}
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </fieldset>
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
  roleNames,
  reload,
  removed,
}: {
  instance: Instance
  models: AdminModel[]
  roleNames: string[]
  reload: () => void
  removed: () => void
}) {
  const [options, setOptions] = useState<Json>(instance.options)
  const [enabled, setEnabled] = useState(instance.enabled)
  const [cleared, setCleared] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const { error, issues, run } = useAction()
  const id = instance.id
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
                json({ options, enabled, clearSecrets: cleared }),
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
          roleNames={roleNames}
          reload={reload}
        />
      ))}
    </section>
  )
}

/** One plugin on its own page. */
function PluginPage({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { instances, models, version, roleNames, error, reload } = usePlugins()
  const instance = instances?.find((candidate) => candidate.id === id)
  return (
    <>
      <Link href="/plugins">Back to plugins</Link>
      {instance ? (
        <PluginForm
          key={version}
          instance={instance}
          models={models}
          roleNames={roleNames}
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
          <Route path="/roles">
            <Roles />
          </Route>
          <Route path="/access">
            <Access />
          </Route>
          <Route path="/plugins/new">
            <NewPlugin />
          </Route>
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
          <Route>
            <Users />
          </Route>
        </Switch>
      </main>
    </div>
  )
}
