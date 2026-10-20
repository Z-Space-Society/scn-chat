import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useAppForm } from '../../src/shared/form.tsx'
import { choose } from '../helpers/select.ts'

interface Props {
  onSubmit: (value: { name: string; bio: string; public: boolean; plan: string }) => void
}

function Example(props: Props) {
  const form = useAppForm({
    defaultValues: { name: '', bio: '', public: false, plan: 'free' },
    onSubmit: ({ value }) => props.onSubmit(value),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">
          {(field) => <field.TextField aria-label="Name" required />}
        </form.AppField>
        <form.AppField name="bio">{(field) => <field.TextAreaField label="Bio" />}</form.AppField>
        <form.AppField name="public">
          {(field) => <field.SwitchField aria-label="Public" />}
        </form.AppField>
        <form.AppField name="plan">
          {(field) => (
            <field.SelectField
              label="Plan"
              options={[
                { value: 'free', label: 'Free' },
                { value: 'paid', label: 'Paid' },
              ]}
            />
          )}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  )
}

describe('the form kit', () => {
  it('binds each control to its field, labels it, and submits the values', async () => {
    const onSubmit = vi.fn()
    render(<Example onSubmit={onSubmit} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada')
    await user.type(screen.getByLabelText('Bio'), 'Counts things')
    await user.click(screen.getByLabelText('Public'))
    await choose(screen.getByRole('combobox', { name: 'Plan' }), 'Paid')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada',
      bio: 'Counts things',
      public: true,
      plan: 'paid',
    })
  })
})
