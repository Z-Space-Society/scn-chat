import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { Item, ItemList, ItemNames, ListLabel } from '../../../shared/ui/ItemList.tsx'
import { cardAlert, inlineForm, SettingsGroup } from '../../../shared/ui/SettingsPage.tsx'
import { adminInvitesQuery } from '../queries.ts'

/** People an admin added who haven't signed in yet, under a form to add more. */
export function Invites() {
  const { data: invites } = useSuspenseQuery(adminInvitesQuery)
  const queryClient = useQueryClient()
  const reload = () => queryClient.invalidateQueries({ queryKey: adminInvitesQuery.queryKey })
  const add = useMutation({
    mutationFn: (identifier: string) => read(api.admin.users.$post({}, json({ identifier }))),
    onSuccess: reload,
  })
  const remove = useMutation({
    mutationFn: (did: string) => read(api.admin.invites[':did'].$delete({ param: { did } })),
    onSuccess: reload,
  })
  const form = useAppForm({
    defaultValues: { identifier: '' },
    onSubmit: ({ value, formApi }) =>
      add.mutate(value.identifier, { onSuccess: () => formApi.reset() }),
  })
  return (
    <SettingsGroup
      title="Add a user"
      description="They can create an account whatever the registration mode is."
    >
      <form.AppForm>
        <form.Form className={inlineForm}>
          <form.AppField name="identifier">
            {(field) => (
              <field.TextField aria-label="Add a user" placeholder="Handle or DID" required />
            )}
          </form.AppField>
          <form.SubmitButton>Add user</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      {invites.length > 0 && (
        <div>
          <ListLabel>Added, not signed in yet</ListLabel>
          <ItemList>
            {invites.map((invite) => (
              <Item key={invite.did}>
                <ItemNames
                  title={invite.handle ?? invite.did}
                  description={invite.handle && invite.did}
                />
                <Button onClick={() => remove.mutate(invite.did)}>Remove</Button>
              </Item>
            ))}
          </ItemList>
        </div>
      )}
      <ErrorAlert error={lastError(add, remove)} className={cardAlert} />
    </SettingsGroup>
  )
}
