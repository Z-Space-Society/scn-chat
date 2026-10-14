import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { Badge } from '../../../shared/ui/Badge.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { Checklist, ChecklistItem } from '../../../shared/ui/Checklist.tsx'
import { ItemList, LinkItem } from '../../../shared/ui/ItemList.tsx'
import {
  cardAlert,
  inlineForm,
  SettingsEmpty,
  SettingsGroup,
  undivided,
} from '../../../shared/ui/SettingsPage.tsx'
import { noCapabilities } from '../../models/capabilities.ts'
import { useModelsChanged } from '../hooks/changes.ts'
import { type AdminModel, type Capabilities, capabilityNames } from '../lib/models.ts'
import type { AdminPlugin } from '../queries.ts'

type Provider = AdminPlugin['providers'][number]

interface Props {
  instance: AdminPlugin
  /** The plugin's options as they are in its form, saved or not, for listing models. */
  options: Record<string, unknown>
  provider: Provider
  models: AdminModel[]
}

/** A provider's admin models, each opening its page, and the ways to add more. */
export function ProviderModels(props: Props) {
  const modelsChanged = useModelsChanged()
  const add = useMutation({
    mutationFn: (model: AdminModel) => read(api.admin.models.$post({}, json(model))),
    onSuccess: modelsChanged,
  })
  const list = useMutation({
    mutationFn: () =>
      read(
        api.admin.plugins['list-models'].$post(
          {},
          json({
            package: props.instance.package,
            instanceId: props.instance.id,
            options: props.options,
          }),
        ),
      ),
  })
  const listed = (list.data?.models ?? []).filter((model) => model.provider === props.provider.id)
  // A model a provider lists starts with the user role and the capabilities the list reports.
  const offer = (
    model: { id: string; name: string; capabilities: Capabilities },
    options?: { onSuccess: () => void },
  ) =>
    add.mutate({ provider: props.provider.id, ...model, roles: ['user'], default: false }, options)
  const offered = new Set(props.models.map((model) => model.id))
  const form = useAppForm({
    defaultValues: { id: '' },
    onSubmit: ({ value, formApi }) => {
      const id = value.id.trim()
      offer({ id, name: id, capabilities: noCapabilities }, { onSuccess: () => formApi.reset() })
    },
  })
  const name = props.provider.name
  return (
    <>
      <SettingsGroup
        title={`Models for ${name}`}
        description="Each opens its page, where you set its name, capabilities, and roles."
      >
        <ModelList pluginId={props.instance.id} models={props.models} />
      </SettingsGroup>
      <SettingsGroup title={`Add ${name} models`} description={addHint(props.provider)}>
        {listed.length > 0 && (
          // Models the provider lists, to tick the ones to offer, over the field to type one.
          <Checklist>
            {listed.map((model) => (
              <ChecklistItem
                key={model.id}
                checked={offered.has(model.id)}
                disabled={offered.has(model.id) || !props.provider.hasAdminKey}
                onChange={() =>
                  offer({ id: model.id, name: model.name, capabilities: model.capabilities })
                }
              >
                {model.name} <code className="text-caption text-muted">{model.id}</code>
              </ChecklistItem>
            ))}
          </Checklist>
        )}
        <form.AppForm>
          <form.Form className={cn(inlineForm, listed.length > 0 && undivided)}>
            <form.AppField name="id">
              {(field) => (
                <field.TextField
                  aria-label={`Model ID for ${name}`}
                  placeholder="Model ID"
                  required
                />
              )}
            </form.AppField>
            <Button type="submit" disabled={!props.provider.hasAdminKey}>
              Add model
            </Button>
            {props.provider.listsModels && (
              <Button tone="quiet" busy={list.isPending} onClick={() => list.mutate()}>
                Refresh model list
              </Button>
            )}
          </form.Form>
        </form.AppForm>
        <ErrorAlert error={lastError(add, list)} className={cardAlert} />
      </SettingsGroup>
    </>
  )
}

/** What adding a provider's models takes, which depends on its key and whether it lists them. */
function addHint(provider: Provider) {
  if (!provider.hasAdminKey) return "Add an admin key to offer this provider's models."
  if (provider.listsModels)
    return 'Pick from the models the provider lists, using the settings above as they are now, or type a model ID.'
  return 'Type the ID of a model to offer.'
}

interface ModelListProps {
  pluginId: string
  models: AdminModel[]
}

/** The provider's admin models, each opening its page, with what it can do and who gets it. */
function ModelList(props: ModelListProps) {
  if (props.models.length === 0) return <SettingsEmpty>No models yet.</SettingsEmpty>
  return (
    <ItemList>
      {props.models.map((model) => {
        const capabilities = capabilityNames.filter((c) => model.capabilities[c])
        return (
          <LinkItem
            key={model.id}
            link={
              <>
                <Link
                  to="/admin/plugins/$id/model"
                  params={{ id: props.pluginId }}
                  search={{ provider: model.provider, id: model.id }}
                >
                  {model.name}
                </Link>{' '}
                {model.default && <Badge tone="good">Default</Badge>}
              </>
            }
            details={[
              <code key="id" className="text-caption">
                {model.id}
              </code>,
              capabilities.length > 0 && capabilities.join(', '),
              model.roles.length ? `For ${model.roles.join(', ')}` : 'No roles',
            ]}
          />
        )
      })}
    </ItemList>
  )
}
