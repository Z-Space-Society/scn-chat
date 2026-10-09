import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { ReorderButtons } from '../components/ReorderButtons.tsx'
import { usePluginsChanged } from '../hooks/changes.ts'
import { moveItem } from '../lib/reorder.ts'
import { adminPluginsQuery } from '../queries.ts'

/** Every configured plugin in load order, each linking to its page. */
export function PluginsAdmin() {
  const plugins = useQuery(adminPluginsQuery)
  const instances = plugins.data ?? []
  const pluginsChanged = usePluginsChanged()
  const reorder = useMutation({
    mutationFn: (ids: string[]) => read(api.admin.plugins.order.$put({}, json({ ids }))),
    onSuccess: pluginsChanged,
  })
  const loadError = plugins.error && messageOf(plugins.error)
  const error = reorder.error ? messageOf(reorder.error) : loadError
  return (
    <section>
      <h2>Plugins</h2>
      <p>Plugins load in this order, which is also the order their hooks run in.</p>
      {plugins.data?.length === 0 && <p>No plugins yet.</p>}
      <ol>
        {instances.map((instance, index) => (
          <li key={instance.id}>
            <Link to="/admin/plugins/$id" params={{ id: instance.id }}>
              {instance.name ?? instance.package}
            </Link>{' '}
            <code>{instance.package}</code> {instance.status}{' '}
            <ReorderButtons
              index={index}
              count={instances.length}
              onMove={(by) =>
                reorder.mutate(moveItem(instances, index, by).map((instance) => instance.id))
              }
            />
            {instance.error && <p role="alert">{instance.error}</p>}
          </li>
        ))}
      </ol>
      <Link to="/admin/plugins/new">Add plugin</Link>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
