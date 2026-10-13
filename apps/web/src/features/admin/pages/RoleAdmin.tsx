import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { ArrowLeftIcon } from '../../../shared/icons.tsx'
import { splitLines } from '../../../shared/lines.ts'
import { Badge } from '../../../shared/ui/Badge.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { monoField } from '../../../shared/ui/controls.tsx'
import { Item, ItemList, ItemMark, ItemNames } from '../../../shared/ui/ItemList.tsx'
import {
  backLink,
  ConfirmButton,
  cardAlert,
  inlineForm,
  SaveBar,
  SettingRow,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { useRolesChanged } from '../hooks/changes.ts'
import { type AdminRole, adminRolesQuery } from '../queries.ts'

interface RoleAdminProps {
  name: string
}

/** One role on its own page. */
export function RoleAdmin(props: RoleAdminProps) {
  const { data } = useSuspenseQuery(adminRolesQuery)
  const navigate = useNavigate()
  const rolesChanged = useRolesChanged()
  const remove = useMutation({
    mutationFn: () => read(api.admin.roles[':name'].$delete({ param: { name: props.name } })),
    // Leave first, so the page doesn't say the role it just deleted doesn't exist.
    onSuccess: async () => {
      await navigate({ to: '/admin/roles' })
      await rolesChanged()
    },
  })
  const role = data.roles.find((candidate) => candidate.name === props.name)
  const back = (
    <Link to="/admin/roles" className={backLink}>
      <ArrowLeftIcon /> Roles
    </Link>
  )
  if (!role)
    return (
      <SettingsPage title={props.name} back={back}>
        <p role="alert">This role doesn't exist.</p>
      </SettingsPage>
    )
  return (
    <SettingsPage
      title={role.name}
      description={
        role.builtIn ? 'A built-in role. It can be edited but not deleted.' : role.description
      }
      back={back}
    >
      <RoleMembers role={role} environmentAdmins={data.environmentAdmins} />
      <RoleDetails role={role} />
      {!role.builtIn && (
        <SettingsGroup danger>
          <SettingRow
            label="Delete this role"
            description="Its members lose the models and tools it gives them."
            issues={<ErrorAlert error={remove.error} className="mt-0.75 text-small" />}
          >
            <ConfirmButton
              label="Delete role"
              question="Delete this role?"
              onConfirm={() => remove.mutate()}
            />
          </SettingRow>
        </SettingsGroup>
      )}
    </SettingsPage>
  )
}

interface RoleProps {
  role: AdminRole
}

/** A role's description, and the PDS hosts and handle domains whose accounts it matches. */
function RoleDetails(props: RoleProps) {
  const rolesChanged = useRolesChanged()
  const save = useMutation({
    mutationFn: (draft: { description: string; hosts: string; domains: string }) =>
      read(
        api.admin.roles[':name'].$patch(
          { param: { name: props.role.name } },
          json({
            description: draft.description,
            pdsHosts: splitLines(draft.hosts),
            handleDomains: splitLines(draft.domains),
          }),
        ),
      ),
    onSuccess: rolesChanged,
  })
  return (
    <RoleForm
      // Start over from the stored role whenever it changes.
      key={formKey(props.role)}
      role={props.role}
      pending={save.isPending}
      saved={save.isSuccess}
      error={save.error && messageOf(save.error)}
      onSave={save.mutate}
      onEdit={save.reset}
    />
  )
}

interface RoleFormProps extends RoleProps {
  pending: boolean
  saved: boolean
  error?: string | null
  onSave: (draft: { description: string; hosts: string; domains: string }) => void
  /** Called on any change, since what is shown is no longer what was saved. */
  onEdit: () => void
}

function RoleForm(props: RoleFormProps) {
  const form = useAppForm({
    defaultValues: {
      description: props.role.description,
      hosts: props.role.pdsHosts.join('\n'),
      domains: props.role.handleDomains.join('\n'),
    },
    listeners: { onChange: () => props.onEdit() },
    onSubmit: ({ value }) => props.onSave(value),
  })
  return (
    <form.AppForm>
      <form.Form>
        <SettingsGroup title="Details">
          <form.AppField name="description">
            {(field) => (
              <SettingRow
                label="Description"
                htmlFor="role-description"
                description="Shown under the role's name."
                wide
              >
                <field.TextField id="role-description" />
              </SettingRow>
            )}
          </form.AppField>
          <form.AppField name="hosts">
            {(field) => (
              <SettingRow
                label="PDS hosts"
                htmlFor="role-hosts"
                description="Everyone whose PDS is on one of these hosts holds this role. One per line."
                wide
              >
                <field.TextAreaField
                  id="role-hosts"
                  rows={2}
                  placeholder="pds.example.com"
                  className={cn(monoField, 'min-h-16!')}
                />
              </SettingRow>
            )}
          </form.AppField>
          <form.AppField name="domains">
            {(field) => (
              <SettingRow
                label="Handle domains"
                htmlFor="role-domains"
                description="Everyone whose handle ends in one of these domains holds this role. One per line."
                wide
              >
                <field.TextAreaField
                  id="role-domains"
                  rows={2}
                  placeholder="example.com"
                  className={cn(monoField, 'min-h-16!')}
                />
              </SettingRow>
            )}
          </form.AppField>
        </SettingsGroup>
        <SaveBar pending={props.pending} saved={props.saved} error={props.error} />
      </form.Form>
    </form.AppForm>
  )
}

interface RoleMembersProps extends RoleProps {
  environmentAdmins: string[]
}

/** A role's explicit members, and the admins the environment names for the admin role. */
function RoleMembers(props: RoleMembersProps) {
  const name = props.role.name
  const rolesChanged = useRolesChanged()
  const addMember = useMutation({
    mutationFn: (identifier: string) =>
      read(api.admin.roles[':name'].members.$post({ param: { name } }, json({ identifier }))),
    onSuccess: rolesChanged,
  })
  const removeMember = useMutation({
    mutationFn: (did: string) =>
      read(api.admin.roles[':name'].members[':did'].$delete({ param: { name, did } })),
    onSuccess: rolesChanged,
  })
  const form = useAppForm({
    defaultValues: { identifier: '' },
    onSubmit: ({ value, formApi }) =>
      addMember.mutate(value.identifier, { onSuccess: () => formApi.reset() }),
  })
  const environmentAdmins = name === 'admin' ? props.environmentAdmins : []
  const empty = !props.role.members.length && !environmentAdmins.length
  return (
    <SettingsGroup
      title="Members"
      description="People added to this role one by one, on top of everyone its rules match."
    >
      <form.AppForm>
        <form.Form className={cn(inlineForm, !empty && 'pb-0')}>
          <form.AppField name="identifier">
            {(field) => (
              <field.TextField
                aria-label={`Add a member to ${name}`}
                placeholder="Handle or DID"
                required
              />
            )}
          </form.AppField>
          <form.SubmitButton>Add member</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      <MemberList
        role={props.role}
        environmentAdmins={environmentAdmins}
        onRemove={removeMember.mutate}
      />
      <ErrorAlert error={lastError(addMember, removeMember)} className={cardAlert} />
    </SettingsGroup>
  )
}

interface MemberListProps extends RoleProps {
  /** The admins set in the environment, listed on the admin role but not removable. */
  environmentAdmins: string[]
  onRemove: (did: string) => void
}

/** A member's DID, when their handle names them, and who added them. */
function memberNote(member: AdminRole['members'][number]) {
  const note = [member.handle && member.did, member.addedBy && `Added by ${member.addedBy}`]
  return note.filter(Boolean).join(' · ') || undefined
}

/** A role's explicit members, with who added each, or a note that there are none. */
function MemberList(props: MemberListProps) {
  if (!props.role.members.length && !props.environmentAdmins.length)
    return <SettingsEmpty>No one has been added yet.</SettingsEmpty>
  return (
    // The list follows the form it adds to, with no line between.
    <ItemList className="before:hidden">
      {props.environmentAdmins.map((did) => (
        <Item key={did}>
          <ItemMark initial>{null}</ItemMark>
          <ItemNames title={did} description="Set in ADMIN_DIDS, so it can't be removed here" />
          <Badge>ADMIN_DIDS</Badge>
        </Item>
      ))}
      {props.role.members.map((member) => (
        <Item key={member.did}>
          <ItemMark initial>{member.handle?.slice(0, 1).toUpperCase()}</ItemMark>
          <ItemNames title={member.handle ?? member.did} description={memberNote(member)} />
          <Button tone="quiet" onClick={() => props.onRemove(member.did)}>
            Remove
          </Button>
        </Item>
      ))}
    </ItemList>
  )
}
