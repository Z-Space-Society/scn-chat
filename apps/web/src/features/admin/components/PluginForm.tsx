import { useStore as useFormStore } from '@tanstack/react-form'
import { useAppForm } from '../../../shared/form.tsx'
import type { Issue } from '../../../shared/response.ts'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
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
  saved: boolean
  onSave: (change: PluginChange) => void
  onRemove: () => void
}

/** A plugin's switch and options, then each of its providers' models. */
export function PluginForm(props: Props) {
  const form = useAppForm({
    defaultValues: {
      options: props.instance.options,
      enabled: props.instance.enabled,
      clearSecrets: [],
    } as PluginChange,
    onSubmit: ({ value }) =>
      props.onSave({ ...value, options: knownOptions(props.instance.schema, value.options) }),
  })
  // The provider blocks list models with the options as they are in the form, saved or not.
  const options = useFormStore(form.store, (state) => state.values.options)
  return (
    <>
      <form.AppForm>
        <form.Form>
          <form.AppField name="enabled">
            {(field) => <field.CheckboxField label="Enabled" />}
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
          <form.SubmitButton>Save</form.SubmitButton>{' '}
          <button type="button" onClick={props.onRemove}>
            Remove plugin
          </button>
          {props.saved && <span>Saved.</span>}
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
    </>
  )
}
