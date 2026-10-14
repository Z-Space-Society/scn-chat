import { useId } from 'react'
import { useAppForm } from '../../../shared/form.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { PanelCard, panelForm } from '../../../shared/ui/PanelCard.tsx'

interface Props {
  /** The chat's stored instructions, empty when it has none. */
  instructions: string
  /** Save the instructions, resolving once they are saved or have failed. */
  onSave: (instructions: string) => Promise<void>
  onCancel: () => void
  /** Classes that place the panel, such as under the control that opened it. */
  className?: string
}

/**
 * The chat's own instructions, which the model follows in every reply here, after the user's custom
 * instructions. Saving them empty clears them.
 */
export function InstructionsPanel(props: Props) {
  const hint = useId()
  const form = useAppForm({
    defaultValues: { instructions: props.instructions },
    // Saving them unchanged only closes the panel, so the chat doesn't move up the list.
    onSubmit: ({ value }) => {
      const instructions = value.instructions.trim()
      return instructions === props.instructions ? props.onCancel() : props.onSave(instructions)
    },
  })
  return (
    <form.AppForm>
      <form.Form className={panelForm}>
        <PanelCard title="Instructions" className={props.className}>
          <p id={hint} className="w-full text-muted text-small">
            Followed in every reply in this chat, after your custom instructions.
          </p>
          <form.AppField name="instructions">
            {(field) => (
              <field.TextAreaField
                aria-label="Instructions for this chat"
                aria-describedby={hint}
                // The panel opens because the user asked to edit them.
                autoFocus
                rows={6}
                placeholder="For example: You're reviewing my Rust code. Keep answers short."
                className="w-full"
              />
            )}
          </form.AppField>
          <form.SubmitButton>Save</form.SubmitButton>
          <Button onClick={props.onCancel}>Cancel</Button>
        </PanelCard>
      </form.Form>
    </form.AppForm>
  )
}
