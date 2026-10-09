import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { issuesOf, lastError } from '../../../shared/errors.ts'
import { formKey } from '../../../shared/form.tsx'
import { type PluginChange, PluginForm } from '../components/PluginForm.tsx'
import { usePluginsChanged } from '../hooks/changes.ts'
import { storedModel } from '../lib/models.ts'
import { type AdminPlugin, adminModelsQuery, adminPluginsQuery } from '../queries.ts'

interface PluginAdminProps {
  id: string
}

/** One plugin on its own page: its options, its provider models, and its removal. */
export function PluginAdmin(props: PluginAdminProps) {
  const { data: plugins } = useSuspenseQuery(adminPluginsQuery)
  const navigate = useNavigate()
  const pluginsChanged = usePluginsChanged()
  const save = useMutation({
    mutationFn: (change: PluginChange) =>
      read(api.admin.plugins[':id'].$put({ param: { id: props.id } }, json(change))),
    onSuccess: pluginsChanged,
  })
  const remove = useMutation({
    mutationFn: () => read(api.admin.plugins[':id'].$delete({ param: { id: props.id } })),
    // Leave first, so the page doesn't say the plugin it just removed isn't configured.
    onSuccess: async () => {
      await navigate({ to: '/admin/plugins' })
      await pluginsChanged()
    },
  })
  const instance = plugins.find((candidate) => candidate.id === props.id)
  return (
    <>
      <Link to="/admin/plugins">Back to plugins</Link>
      <PluginDetails
        instance={instance}
        issues={save.error ? issuesOf(save.error) : (instance?.issues ?? [])}
        saved={save.isSuccess}
        onSave={save.mutate}
        onRemove={() => remove.mutate()}
      />
      <ErrorAlert error={lastError(save, remove)} />
    </>
  )
}

interface PluginDetailsProps {
  instance: AdminPlugin | undefined
  issues: AdminPlugin['issues']
  saved: boolean
  onSave: (change: PluginChange) => void
  onRemove: () => void
}

/** The plugin's status and form, or that it isn't configured. */
function PluginDetails(props: PluginDetailsProps) {
  const { data: models } = useSuspenseQuery(adminModelsQuery)
  if (!props.instance) return <p role="alert">This plugin isn't configured.</p>
  return (
    <section>
      <h2>{props.instance.name ?? props.instance.package}</h2>
      <p>
        <code>{props.instance.package}</code>: {props.instance.status}
      </p>
      {props.instance.error && <p role="alert">{props.instance.error}</p>}
      <PluginForm
        // Start over from the stored plugin whenever it changes.
        key={formKey(props.instance)}
        instance={props.instance}
        models={models.map(storedModel)}
        issues={props.issues}
        saved={props.saved}
        onSave={props.onSave}
        onRemove={props.onRemove}
      />
    </section>
  )
}
