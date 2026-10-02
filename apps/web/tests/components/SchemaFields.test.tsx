import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SchemaFields } from '../../src/components/SchemaFields.tsx'

const schema = {
  properties: {
    engine: { type: 'string', enum: ['duckduckgo', 'kagi'] },
    safe: { type: 'boolean' },
  },
}

describe('SchemaFields', () => {
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

  it('edits a list of strings one per line, leaving out blank lines', async () => {
    const onChange = vi.fn()
    render(
      <SchemaFields
        schema={{ properties: { domains: { type: 'array', items: { type: 'string' } } } }}
        values={{ domains: ['a.example'] }}
        onChange={onChange}
      />,
    )
    const box = screen.getByRole('textbox')
    expect(box).toHaveValue('a.example')
    await userEvent.type(box, '{Enter}{Enter}b.example')
    expect(onChange).toHaveBeenLastCalledWith('domains', ['a.example', 'b.example'])
  })

  it('shows issues for a nested field and reports the whole object on change', async () => {
    const onChange = vi.fn()
    render(
      <SchemaFields
        schema={{
          properties: {
            safetyNet: {
              type: 'object',
              title: 'Safety net',
              properties: { enabled: { type: 'boolean' }, minutes: { type: 'integer' } },
            },
          },
        }}
        values={{ safetyNet: { enabled: false, minutes: 15 } }}
        issues={[{ path: ['safetyNet', 'minutes'], message: 'Too small' }]}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Too small')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith('safetyNet', { enabled: true, minutes: 15 })
  })

  it('offers to clear a stored secret when the form supports it', async () => {
    const onClear = vi.fn()
    render(
      <SchemaFields
        schema={{ properties: { apiKey: { type: 'string' } } }}
        values={{}}
        secretFields={['apiKey']}
        secretsSet={['apiKey']}
        cleared={['apiKey']}
        onClear={onClear}
        onChange={() => {}}
      />,
    )
    expect(screen.getByPlaceholderText('Saved. Leave blank to keep.')).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledWith('apiKey', false)
  })

  it('leaves a number field empty when it has no value, and reports clearing it as unset', async () => {
    const onChange = vi.fn()
    render(
      <SchemaFields
        schema={{ properties: { words: { type: 'integer' } } }}
        values={{ words: 5 }}
        onChange={onChange}
      />,
    )
    await userEvent.clear(screen.getByRole('spinbutton'))
    expect(onChange).toHaveBeenLastCalledWith('words', undefined)
  })
})
