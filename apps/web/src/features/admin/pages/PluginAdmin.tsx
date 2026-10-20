import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { issuesOf, messageOf } from '../../../shared/errors.ts'
import { formKey } from '../../../shared/form.tsx'
import { ArrowLeftIcon } from '../../../shared/icons.tsx'
import { backLink, Callout, type Save, SettingsPage } from '../../../shared/ui/SettingsPage.tsx'
import { type PluginChange, PluginForm } from '../components/PluginForm.tsx'
import { PluginStatus } from '../components/PluginStatus.tsx'
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
  const back = (
    <Link to="/admin/plugins" className={backLink}>
      <ArrowLeftIcon /> Plugins
    </Link>
  )
  if (!instance)
    return (
      <SettingsPage title="Plugin" back={back}>
        <p role="alert">This plugin isn't configured.</p>
      </SettingsPage>
    )
  return (
    <SettingsPage
      title={instance.name ?? instance.package}
      description={
        <>
          <code>{instance.package}</code> <PluginStatus status={instance.status} />
        </>
      }
      back={back}
    >
      {instance.error && (
        <Callout tone="danger">
          <p role="alert">{instance.error}</p>
        </Callout>
      )}
      <PluginDetails
        instance={instance}
        issues={save.error ? issuesOf(save.error) : instance.issues}
        save={save}
        removeError={remove.error && messageOf(remove.error)}
        onRemove={() => remove.mutate()}
      />
    </SettingsPage>
  )
}

interface PluginDetailsProps {
  instance: AdminPlugin
  issues: AdminPlugin['issues']
  removeError?: string | null
  save: Save<PluginChange>
  onRemove: () => void
}

/** The plugin's form, with its provider models from the models list. */
function PluginDetails(props: PluginDetailsProps) {
  const { data: models } = useSuspenseQuery(adminModelsQuery)
  return (
    <PluginForm
      // Start over from the stored plugin whenever it changes.
      key={formKey(props.instance)}
      {...props}
      models={models.map(storedModel)}
    />
  )
}
