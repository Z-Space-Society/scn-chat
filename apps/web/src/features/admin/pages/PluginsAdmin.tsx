import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { usePluginsChanged } from '../hooks/changes.ts'
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
  const move = (index: number, by: number) => {
    const ids = instances.map((instance) => instance.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved as string)
    reorder.mutate(ids)
  }
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
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
              Up
            </button>{' '}
            <button
              type="button"
              disabled={index === instances.length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </button>
            {instance.error && <p role="alert">{instance.error}</p>}
          </li>
        ))}
      </ol>
      <Link to="/admin/plugins/new">Add plugin</Link>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
