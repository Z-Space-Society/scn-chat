import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { adminInvitesQuery } from '../queries.ts'

/** People an admin added who haven't signed in yet, and a form to add more. */
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
    <div>
      <form.AppForm>
        <form.Form>
          <h3>Add user</h3>
          <p>They can create an account whatever the registration mode is.</p>
          <form.AppField name="identifier">
            {(field) => (
              <field.TextField aria-label="Add a user" placeholder="Handle or DID" required />
            )}
          </form.AppField>
          <form.SubmitButton>Add user</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      {invites.length > 0 && (
        <>
          <h3>Added, not signed in yet</h3>
          <ul>
            {invites.map((invite) => (
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
      <ErrorAlert error={lastError(add, remove)} />
    </div>
  )
}
