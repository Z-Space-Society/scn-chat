import type { ModelRef } from '@scn-chat/lexicons'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { EffortSelect, ModelSelect } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { type ModelOption, modelRef } from '../../models/models.ts'
import { savePreferences } from '../lib/preferences.ts'
import { preferencesQuery } from '../queries.ts'

/** The user's preferences. The models are optional, so failing to load them shows an alert. */
export function PreferencesSettings() {
  const { models, error } = useModels()
  const { data: stored } = useSuspenseQuery(preferencesQuery)
  return (
    <>
      <ErrorAlert error={error} />
      <PreferencesForm stored={stored ?? {}} models={models} />
    </>
  )
}

interface PreferencesFormProps {
  /** The stored preferences record. */
  stored: Record<string, unknown>
  models: ModelOption[]
}

function PreferencesForm(props: PreferencesFormProps) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: savePreferences,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: preferencesQuery.queryKey }),
  })
  const form = useAppForm({
    defaultValues: {
      defaultModel: (props.stored.defaultModel as ModelRef | undefined) ?? null,
      defaultEffort: String(props.stored.defaultEffort ?? ''),
      customInstructions: String(props.stored.customInstructions ?? ''),
      generateTitles: props.stored.generateTitles !== false,
    },
    // Fields this form does not edit, like the time zone, keep their stored values. The mutation
    // holds any error for display, so submitting never rejects.
    onSubmit: ({ value }) =>
      save.mutate({
        ...props.stored,
        defaultModel: value.defaultModel ? modelRef(value.defaultModel) : undefined,
        defaultEffort: value.defaultEffort || undefined,
        customInstructions: value.customInstructions || undefined,
        generateTitles: value.generateTitles,
      }),
  })
  return (
    <form.AppForm>
      <form.Form>
        <h2>Preferences</h2>
        <form.Field name="defaultModel">
          {(field) => (
            <label htmlFor={field.name}>
              Default model
              <ModelSelect
                id={field.name}
                models={props.models}
                value={field.state.value}
                onChange={field.handleChange}
              >
                <option value="">App default</option>
              </ModelSelect>
            </label>
          )}
        </form.Field>
        <form.Field name="defaultEffort">
          {(field) => (
            <label htmlFor={field.name}>
              Default effort
              <EffortSelect id={field.name} value={field.state.value} onChange={field.handleChange}>
                <option value="">Provider default</option>
              </EffortSelect>
            </label>
          )}
        </form.Field>
        <form.AppField name="customInstructions">
          {(field) => <field.TextAreaField label="Custom instructions" />}
        </form.AppField>
        <form.AppField name="generateTitles">
          {(field) => <field.CheckboxField label="Generate titles" />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
        {save.isSuccess && <span>Saved.</span>}
        <ErrorAlert error={save.error} />
      </form.Form>
    </form.AppForm>
  )
}
