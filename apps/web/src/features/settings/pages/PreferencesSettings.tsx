import type { ModelRef } from '@scn-chat/lexicons'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { EffortSelect, ModelSelect } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { type ModelOption, modelRef } from '../../models/models.ts'
import { browserTimeZone } from '../lib/time-zone.ts'
import { preferencesQuery } from '../queries.ts'

interface PreferencesProps {
  models: ModelOption[]
}

function Preferences(props: PreferencesProps) {
  const { data, error } = useQuery(preferencesQuery)
  // The form only renders once the stored preferences load, and starts from them.
  if (data === undefined && error)
    return <p role="alert">Could not load preferences: {messageOf(error)}</p>
  if (data === undefined) return null
  return <PreferencesForm initial={data ?? {}} models={props.models} />
}

interface PreferencesFormProps {
  initial: Record<string, unknown>
  models: ModelOption[]
}

function PreferencesForm(props: PreferencesFormProps) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (record: Record<string, unknown>) =>
      read(api.chats.preferences.$put({}, json({ ...record, timezone: browserTimeZone() }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: preferencesQuery.queryKey }),
  })
  const form = useForm({
    defaultValues: {
      defaultModel: (props.initial.defaultModel as ModelRef | undefined) ?? null,
      defaultEffort: String(props.initial.defaultEffort ?? ''),
      customInstructions: String(props.initial.customInstructions ?? ''),
      generateTitles: props.initial.generateTitles !== false,
    },
    onSubmit: ({ value }) => {
      // Fields this form does not edit, like the time zone, keep their stored values.
      const { $type: _type, updatedAt: _updated, ...record } = props.initial
      // The mutation holds any error for display, so submitting never rejects.
      save.mutate({
        ...record,
        defaultModel: value.defaultModel ? modelRef(value.defaultModel) : undefined,
        defaultEffort: value.defaultEffort || undefined,
        customInstructions: value.customInstructions || undefined,
        generateTitles: value.generateTitles,
      })
    },
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
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
      <form.Field name="customInstructions">
        {(field) => (
          <label>
            Custom instructions
            <textarea
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="generateTitles">
        {(field) => (
          <label>
            <input
              type="checkbox"
              checked={field.state.value}
              onChange={(e) => field.handleChange(e.target.checked)}
            />{' '}
            Generate titles
          </label>
        )}
      </form.Field>
      <button type="submit">Save</button>
      {save.isSuccess && <span>Saved.</span>}
      {save.error && <p role="alert">{messageOf(save.error)}</p>}
    </form>
  )
}

export function PreferencesSettings() {
  const { models, error } = useModels()
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <Preferences models={models} />
    </>
  )
}
