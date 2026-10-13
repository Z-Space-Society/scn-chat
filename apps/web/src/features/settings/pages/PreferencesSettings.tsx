import type { ModelRef } from '@scn-chat/lexicons'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { messageOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { chooseTheme, type ThemeChoice, useThemeChoice } from '../../../shared/theme.ts'
import { Select } from '../../../shared/ui/Select.tsx'
import {
  SaveBar,
  SettingRow,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { EffortSelect } from '../../models/components/EffortSelect.tsx'
import { ModelSelect } from '../../models/components/ModelSelect.tsx'
import { useModels } from '../../models/hooks/useModels.ts'
import { type ModelOption, modelRef } from '../../models/models.ts'
import { savePreferences } from '../lib/preferences.ts'
import { preferencesQuery } from '../queries.ts'

/**
 * The user's preferences, and how this device looks. The models are optional, so failing to load
 * them shows an alert.
 */
export function PreferencesSettings() {
  const { models, error } = useModels()
  const { data: stored } = useSuspenseQuery(preferencesQuery)
  return (
    <SettingsPage
      title="Preferences"
      description="How new chats start, and what every model is told."
    >
      <ErrorAlert error={error} />
      <Appearance />
      <PreferencesForm stored={stored ?? {}} models={models} />
    </SettingsPage>
  )
}

const themes: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Light or dark for this device, applied at once and kept here, apart from the saved preferences. */
function Appearance() {
  const theme = useThemeChoice()
  return (
    <SettingsGroup title="Appearance">
      <SettingRow
        label="Theme"
        htmlFor="theme"
        description="Follow your system, or keep this device light or dark."
      >
        <Select
          id="theme"
          options={themes}
          value={theme}
          onChange={(value) => chooseTheme(value as ThemeChoice)}
        />
      </SettingRow>
    </SettingsGroup>
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
    // An edit after a save means the page no longer holds what was saved.
    listeners: { onChange: () => save.reset() },
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
        <SettingsGroup title="Models">
          <form.Field name="defaultModel">
            {(field) => (
              <SettingRow
                label="Default model"
                htmlFor={field.name}
                description="New chats start with this model. You can switch in any chat."
              >
                <ModelSelect
                  id={field.name}
                  models={props.models}
                  value={field.state.value}
                  onChange={field.handleChange}
                  none={{ label: 'App default', selectable: true }}
                />
              </SettingRow>
            )}
          </form.Field>
          <form.Field name="defaultEffort">
            {(field) => (
              <SettingRow
                label="Thinking effort"
                htmlFor={field.name}
                description="How long a model thinks before it answers, when it can."
              >
                <EffortSelect
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  auto={{ label: 'Auto', detail: 'Each model decides' }}
                />
              </SettingRow>
            )}
          </form.Field>
        </SettingsGroup>
        <SettingsGroup title="Instructions">
          <form.AppField name="customInstructions">
            {(field) => (
              <SettingRow
                label="Custom instructions"
                htmlFor="customInstructions"
                description="Sent with every chat. Say what the model should know about you, or how you like answers written."
                wide
              >
                <field.TextAreaField
                  id="customInstructions"
                  rows={5}
                  placeholder="For example: Keep answers short, and use metric units."
                />
              </SettingRow>
            )}
          </form.AppField>
        </SettingsGroup>
        <SettingsGroup title="Chats">
          <form.AppField name="generateTitles">
            {(field) => (
              <SettingRow
                label="Generate titles"
                htmlFor="generateTitles"
                description="Name each new chat from its first message."
              >
                <field.SwitchField id="generateTitles" />
              </SettingRow>
            )}
          </form.AppField>
        </SettingsGroup>
        <SaveBar
          pending={save.isPending}
          saved={save.isSuccess}
          error={save.error && messageOf(save.error)}
        />
      </form.Form>
    </form.AppForm>
  )
}
