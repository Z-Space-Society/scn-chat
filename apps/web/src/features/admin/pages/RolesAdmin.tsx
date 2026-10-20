import { noop, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { plural } from '../../../shared/plural.ts'
import { Badge } from '../../../shared/ui/Badge.tsx'
import * as ItemList from '../../../shared/ui/ItemList.tsx'
import {
  cardAlert,
  inlineForm,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { useRolesChanged } from '../hooks/changes.ts'
import { type AdminRole, adminRolesQuery } from '../queries.ts'

/** A summary of every role, each linking to its page, and a form to create one. */
export function RolesAdmin() {
  const { data } = useSuspenseQuery(adminRolesQuery)
  return (
    <SettingsPage
      title="Roles"
      description="Roles decide who may sign up in invite mode, and which models and paid tools people get."
    >
      <SettingsGroup
        title="All roles"
        description={
          <>
            Everyone who has signed in holds <code>user</code>. A role's members are the people
            added to it, plus everyone whose PDS host or handle domain matches.
          </>
        }
      >
        <ItemList.Root>
          {data.roles.map((role) => (
            <RoleRow
              key={role.name}
              role={role}
              environmentAdmins={data.environmentAdmins.length}
            />
          ))}
        </ItemList.Root>
      </SettingsGroup>
      <NewRoleForm />
    </SettingsPage>
  )
}

interface RoleRowProps {
  role: AdminRole
  /** How many admins the environment names, who count as members of the admin role. */
  environmentAdmins: number
}

/** A role's name, which opens its page, over its description, member count, and rules. */
function RoleRow(props: RoleRowProps) {
  const role = props.role
  const members = role.members.length + (role.name === 'admin' ? props.environmentAdmins : 0)
  return (
    <ItemList.LinkItem>
      <ItemList.Names
        title={
          <>
            <Link to="/admin/roles/$name" params={{ name: role.name }}>
              {role.name}
            </Link>{' '}
            {role.builtIn && <Badge>Built in</Badge>}
          </>
        }
        description={role.description || undefined}
        details={[
          plural(members, { one: '# member', other: '# members' }),
          role.pdsHosts.length > 0 && `PDS on ${role.pdsHosts.join(', ')}`,
          role.handleDomains.length > 0 && `Handles ending in ${role.handleDomains.join(', ')}`,
        ]}
      />
    </ItemList.LinkItem>
  )
}

function NewRoleForm() {
  const rolesChanged = useRolesChanged()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (draft: { name: string; description: string }) =>
      read(api.admin.roles.$post({}, json(draft))),
    onSuccess: async (_, draft) => {
      await rolesChanged()
      await navigate({ to: '/admin/roles/$name', params: { name: draft.name } })
    },
  })
  const form = useAppForm({
    defaultValues: { name: '', description: '' },
    // Returning the create keeps Create role busy until the role's page opens, so it can't be sent twice.
    onSubmit: ({ value }) => create.mutateAsync(value).catch(noop),
  })
  return (
    <SettingsGroup
      title="New role"
      description="Name it, then add its members and matching rules on its page."
    >
      <form.AppForm>
        {/* The name is short, so the description takes the rest of the line. */}
        <form.Form className={cn(inlineForm, '[&>input:first-child]:max-w-48')}>
          <form.AppField name="name">
            {(field) => (
              <field.TextField aria-label="Role name" placeholder="Name, such as member" required />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.TextField aria-label="Role description" placeholder="Description (optional)" />
            )}
          </form.AppField>
          <form.SubmitButton>Create role</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      <ErrorAlert error={create.error} className={cardAlert} />
    </SettingsGroup>
  )
}
