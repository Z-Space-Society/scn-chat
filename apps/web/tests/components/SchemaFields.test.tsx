import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SchemaFields } from '../../src/components/SchemaFields.tsx'

const schema = {
  properties: {
    engine: { type: 'string', enum: ['duckduckgo', 'kagi'] },
    apiKey: { type: 'string' },
    results: { type: 'integer' },
    safe: { type: 'boolean' },
    weird: { type: 'object' },
  },
}

describe('SchemaFields', () => {
  it('renders an input for each supported type, a password for secrets, and marks unsupported types', () => {
    render(
      <SchemaFields
        schema={schema}
        values={{ engine: 'kagi' }}
        secretFields={['apiKey']}
        secretsSet={['apiKey']}
        onChange={() => {}}
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

  it('reports each change with its field name', async () => {
    const onChange = vi.fn()
    render(
      <SchemaFields
        schema={schema}
        values={{}}
        secretFields={[]}
        secretsSet={[]}
        onChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByRole('combobox'), 'duckduckgo')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange.mock.calls).toEqual([
      ['engine', 'duckduckgo'],
      ['safe', true],
    ])
  })

  it('hides and disables fields by their rules as the other field changes', () => {
    const conditional = {
      properties: {
        engine: { type: 'string', enum: ['default', 'kagi'] },
        apiKey: {
          type: 'string',
          rule: {
            effect: 'SHOW' as const,
            condition: { scope: '#/properties/engine', schema: { const: 'kagi' } },
          },
        },
        region: {
          type: 'string',
          rule: {
            effect: 'DISABLE' as const,
            condition: { scope: '#/properties/engine', schema: { const: 'default' } },
          },
        },
      },
    }
    const props = { schema: conditional, secretFields: [], secretsSet: [], onChange: () => {} }
    const { rerender } = render(<SchemaFields {...props} values={{ engine: 'default' }} />)
    expect(screen.queryByLabelText('apiKey')).toBeNull()
    expect(screen.getByLabelText('region')).toBeDisabled()
    rerender(<SchemaFields {...props} values={{ engine: 'kagi' }} />)
    expect(screen.getByLabelText('apiKey')).toBeInTheDocument()
    expect(screen.getByLabelText('region')).toBeEnabled()
  })
})
