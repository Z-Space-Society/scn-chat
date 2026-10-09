import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { ReorderButtons } from '../components/ReorderButtons.tsx'
import { usePluginsChanged } from '../hooks/changes.ts'
import { moveItem } from '../lib/reorder.ts'
import { adminPluginsQuery } from '../queries.ts'

/** Every configured plugin in load order, each linking to its page. */
export function PluginsAdmin() {
  const { data: instances } = useSuspenseQuery(adminPluginsQuery)
  const pluginsChanged = usePluginsChanged()
  const reorder = useMutation({
    mutationFn: (ids: string[]) => read(api.admin.plugins.order.$put({}, json({ ids }))),
    onSuccess: pluginsChanged,
  })
  return (
    <section>
      <h2>Plugins</h2>
      <p>Plugins load in this order, which is also the order their hooks run in.</p>
      {instances.length === 0 && <p>No plugins yet.</p>}
      <ol>
        {instances.map((instance, index) => (
          <PluginRow
            key={instance.id}
            instance={instance}
            index={index}
            count={instances.length}
            onMove={(by) => reorder.mutate(moveItem(instances, index, by).map((moved) => moved.id))}
          />
        ))}
      </ol>
      <Link to="/admin/plugins/new">Add plugin</Link>
      <ErrorAlert error={reorder.error} />
    </section>
  )
}

interface PluginRowProps {
  instance: {
    id: string
    package: string
    name: string | null
    status: string
    error: string | null
  }
  index: number
  count: number
  onMove: (by: number) => void
}

function PluginRow(props: PluginRowProps) {
  const instance = props.instance
  return (
    <li>
      <Link to="/admin/plugins/$id" params={{ id: instance.id }}>
        {instance.name ?? instance.package}
      </Link>{' '}
      <code>{instance.package}</code> {instance.status}{' '}
      <ReorderButtons index={props.index} count={props.count} onMove={props.onMove} />
      {instance.error && <p role="alert">{instance.error}</p>}
    </li>
  )
}
