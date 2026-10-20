import { useStore as useFormStore } from '@tanstack/react-form'
import { useAppForm } from '../../../shared/form.tsx'
import type { Issue } from '../../../shared/response.ts'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import {
  ConfirmButton,
  type Save,
  SaveBar,
  SettingRow,
  SettingsGroup,
} from '../../../shared/ui/SettingsPage.tsx'
import type { AdminModel } from '../lib/models.ts'
import type { AdminPlugin } from '../queries.ts'
import { ProviderModels } from './ProviderModels.tsx'

/** What saving a plugin sends. */
export interface PluginChange {
  options: Record<string, unknown>
  enabled: boolean
  /** Stored secrets to clear. */
  clearSecrets: string[]
}

/** The options the plugin's schema still has, so a save after an upgrade drops the others. */
function knownOptions(schema: AdminPlugin['schema'], options: Record<string, unknown>) {
  const fields = (schema?.properties ?? options) as Record<string, unknown>
  return Object.fromEntries(Object.entries(options).filter(([key]) => key in fields))
}

interface Props {
  instance: AdminPlugin
  models: AdminModel[]
  issues: Issue[]
  removeError?: string | null
  save: Save<PluginChange>
  onRemove: () => void
}

/** A plugin's switch and options, then each of its providers' models, then its removal. */
export function PluginForm(props: Props) {
  const form = useAppForm({
    defaultValues: {
      options: props.instance.options,
      enabled: props.instance.enabled,
      clearSecrets: [],
    } as PluginChange,
    listeners: { onChange: () => props.save.reset() },
    onSubmit: ({ value }) =>
      props.save.mutate({ ...value, options: knownOptions(props.instance.schema, value.options) }),
  })
  // The provider blocks list models with the options as they are in the form, saved or not.
  const options = useFormStore(form.store, (state) => state.values.options)
  return (
    <>
      <form.AppForm>
        <form.Form>
          <SettingsGroup title="Settings">
            <form.AppField name="enabled">
              {(field) => (
                <SettingRow
                  label="Enabled"
                  htmlFor="plugin-enabled"
                  description="When off, the plugin doesn't load, and nothing it adds is offered."
                >
                  <field.SwitchField id="plugin-enabled" />
                </SettingRow>
              )}
            </form.AppField>
            {props.instance.schema && (
              <form.Field name="clearSecrets">
                {(cleared) => (
                  <form.Field name="options">
                    {(field) => (
                      <SchemaFields
                        schema={props.instance.schema as Schema}
                        values={field.state.value}
                        secrets={{
                          fields: props.instance.secretFields,
                          stored: props.instance.secretsSet,
                          unreadable: props.instance.secretsUnreadable,
                          clearing: {
                            cleared: cleared.state.value,
                            onClear: (key, clear) =>
                              cleared.handleChange((current) =>
                                clear ? [...current, key] : current.filter((name) => name !== key),
                              ),
                          },
                        }}
                        issues={props.issues}
                        onChange={(key, value) =>
                          field.handleChange((current) => ({ ...current, [key]: value }))
                        }
                      />
                    )}
                  </form.Field>
                )}
              </form.Field>
            )}
          </SettingsGroup>
          <SaveBar save={props.save} />
        </form.Form>
      </form.AppForm>
      {props.instance.providers.map((provider) => (
        <ProviderModels
          key={provider.id}
          instance={props.instance}
          options={options}
          provider={provider}
          models={props.models.filter((model) => model.provider === provider.id)}
        />
      ))}
      <SettingsGroup danger>
        <SettingRow
          label="Remove this plugin"
          description="Its options are deleted. The package stays installed, so you can add it again."
          issues={
            props.removeError && (
              <p role="alert" className="mt-0.75 text-danger text-small">
                {props.removeError}
              </p>
            )
          }
        >
          <ConfirmButton
            label="Remove plugin"
            question="Remove this plugin?"
            onConfirm={props.onRemove}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  )
}
