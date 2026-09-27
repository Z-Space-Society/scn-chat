import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SchemaForm } from '../../src/components/SchemaForm.tsx'

const schema = {
  properties: {
    engine: { type: 'string', enum: ['duckduckgo', 'kagi'] },
    apiKey: { type: 'string' },
    results: { type: 'integer' },
    safe: { type: 'boolean' },
    weird: { type: 'object' },
  },
}

describe('SchemaForm', () => {
  it('renders an input for each supported type, a password for secrets, and marks unsupported types', () => {
    render(
      <SchemaForm
        schema={schema}
        values={{ engine: 'kagi' }}
        secretFields={['apiKey']}
        secretsSet={['apiKey']}
        onSubmit={() => {}}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('kagi')
    expect(screen.getByPlaceholderText('Saved. Leave blank to keep.')).toHaveAttribute(
      'type',
      'password',
    )
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText('Unsupported setting type')).toBeInTheDocument()
  })

  it('submits the edited values', async () => {
    const onSubmit = vi.fn()
    render(
      <SchemaForm
        schema={schema}
        values={{}}
        secretFields={['apiKey']}
        secretsSet={[]}
        onSubmit={onSubmit}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'duckduckgo')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({ engine: 'duckduckgo', safe: true })
  })
})
