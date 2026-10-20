import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { PlusIcon } from '../../../shared/icons.tsx'
import { button } from '../../../shared/ui/Button.tsx'
import * as ItemList from '../../../shared/ui/ItemList.tsx'
import {
  cardAlert,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { PluginStatus } from '../components/PluginStatus.tsx'
import { ReorderButtons } from '../components/ReorderButtons.tsx'
import { usePluginsChanged } from '../hooks/changes.ts'
import { moveItem } from '../lib/reorder.ts'
import { type AdminPlugin, adminPluginsQuery } from '../queries.ts'

/** Every configured plugin in load order, each linking to its page. */
export function PluginsAdmin() {
  const { data: instances } = useSuspenseQuery(adminPluginsQuery)
  const pluginsChanged = usePluginsChanged()
  const reorder = useMutation({
    mutationFn: (ids: string[]) => read(api.admin.plugins.order.$put({}, json({ ids }))),
    onSuccess: pluginsChanged,
  })
  return (
    <SettingsPage
      title="Plugins"
      description="Plugins load in this order, which is also the order their hooks run in."
      actions={
        <Link to="/admin/plugins/new" className={button({ tone: 'primary' })}>
          <PlusIcon /> Add plugin
        </Link>
      }
    >
      {instances.length === 0 && <SettingsEmpty outlined>No plugins yet.</SettingsEmpty>}
      {instances.length > 0 && (
        <SettingsGroup>
          <ol>
            {instances.map((instance, index) => (
              <PluginRow
                key={instance.id}
                instance={instance}
                index={index}
                count={instances.length}
                moving={reorder.isPending}
                onMove={(by) =>
                  reorder.mutate(moveItem(instances, index, by).map((moved) => moved.id))
                }
              />
            ))}
          </ol>
          <ErrorAlert error={reorder.error} className={cardAlert} />
        </SettingsGroup>
      )}
    </SettingsPage>
  )
}

interface PluginRowProps {
  instance: AdminPlugin
  index: number
  count: number
  moving: boolean
  onMove: (by: number) => void
}

/** A plugin, numbered by its place in the order, with its state and arrows that move it. */
function PluginRow(props: PluginRowProps) {
  const instance = props.instance
  return (
    <ItemList.LinkItem>
      <ItemList.Mark>{props.index + 1}</ItemList.Mark>
      <ItemList.Names
        title={
          <Link to="/admin/plugins/$id" params={{ id: instance.id }}>
            {instance.name ?? instance.package}
          </Link>
        }
        description={<code className="text-caption">{instance.package}</code>}
      >
        {instance.error && (
          <small role="alert" className="text-danger text-small">
            {instance.error}
          </small>
        )}
      </ItemList.Names>
      <PluginStatus status={instance.status} />
      <ReorderButtons
        index={props.index}
        count={props.count}
        disabled={props.moving}
        onMove={props.onMove}
      />
    </ItemList.LinkItem>
  )
}
