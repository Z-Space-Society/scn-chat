import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { Badge } from '../../../shared/ui/Badge.tsx'
import { Radio } from '../../../shared/ui/controls.tsx'
import * as ItemList from '../../../shared/ui/ItemList.tsx'
import {
  cardAlert,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { ReorderButtons } from '../components/ReorderButtons.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import { storedModel } from '../lib/models.ts'
import { moveItem } from '../lib/reorder.ts'
import { type AdminModelEntry, adminModelsQuery } from '../queries.ts'

/** The admin models from every provider, for choosing the default and the order users see. */
export function ModelsAdmin() {
  const { data: models } = useSuspenseQuery(adminModelsQuery)
  const modelsChanged = useModelsChanged()
  const makeDefault = useMutation({
    mutationFn: (model: AdminModelEntry) =>
      read(api.admin.models.$put({}, json({ ...storedModel(model), default: true }))),
    onSuccess: modelsChanged,
  })
  const reorder = useMutation({
    mutationFn: (order: AdminModelEntry[]) =>
      read(
        api.admin.models.order.$put(
          {},
          json({ models: order.map(({ provider, id }) => ({ provider, id })) }),
        ),
      ),
    onSuccess: modelsChanged,
  })
  return (
    <SettingsPage
      title="Models"
      description={
        <>
          The default model, and the order people see models in. Models are added on their
          provider's plugin page, under <Link to="/admin/plugins">Plugins</Link>.
        </>
      }
    >
      {models.length === 0 && <SettingsEmpty outlined>No models yet.</SettingsEmpty>}
      {models.length > 0 && (
        <SettingsGroup
          title="Default and order"
          description="The chosen model is the default for new chats. People see the models in this order."
        >
          <ol>
            {models.map((model, index) => (
              <ModelRow
                key={`${model.provider}/${model.id}`}
                model={model}
                index={index}
                count={models.length}
                moving={reorder.isPending}
                onMakeDefault={() => makeDefault.mutate(model)}
                onMove={(by) => reorder.mutate(moveItem(models, index, by))}
              />
            ))}
          </ol>
          <ErrorAlert error={lastError(makeDefault, reorder)} className={cardAlert} />
        </SettingsGroup>
      )}
    </SettingsPage>
  )
}

interface ModelRowProps {
  model: AdminModelEntry
  index: number
  count: number
  /** Whether a move is on its way. */
  moving: boolean
  onMakeDefault: () => void
  onMove: (by: number) => void
}

/**
 * A model as a row that is also a radio, which picks it as the default from a click anywhere on
 * it, with arrows that move it beside it.
 */
function ModelRow(props: ModelRowProps) {
  const model = props.model
  const ref = `${model.provider}/${model.id}`
  const id = useId()
  const warningId = useId()
  return (
    <ItemList.Item className="flex-nowrap has-[label:hover]:bg-row-hover">
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5">
        <ItemList.Names
          className="gap-0.5"
          title={
            <>
              {model.name} {model.default && <Badge tone="good">Default</Badge>}
            </>
          }
          description={<code className="text-caption">{ref}</code>}
        >
          {model.warning && (
            <small id={warningId} role="alert" className="text-danger text-small">
              {model.warning}
            </small>
          )}
        </ItemList.Names>
        <Radio
          id={id}
          name="default-model"
          aria-label={`${model.name} ${ref}`}
          aria-describedby={model.warning ? warningId : undefined}
          checked={model.default}
          onChange={props.onMakeDefault}
        />
      </label>
      <ReorderButtons
        index={props.index}
        count={props.count}
        disabled={props.moving}
        onMove={props.onMove}
      />
    </ItemList.Item>
  )
}
