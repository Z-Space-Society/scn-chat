import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EffortSelect } from '../../../src/features/models/components/EffortSelect.tsx'

interface EffortProps {
  onChange?: (value: string) => void
}

function Effort(props: EffortProps) {
  const [value, setValue] = useState('')
  return (
    <EffortSelect
      aria-label="Thinking effort"
      auto={{ label: 'Auto thinking', detail: 'Each model decides' }}
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onChange?.(next)
      }}
    />
  )
}

const button = () => screen.getByRole('combobox', { name: 'Thinking effort' })

describe('EffortSelect', () => {
  it('lists the levels from Off to Extra under a Thinking effort heading, each with a timer pie', async () => {
    render(<Effort />)
    expect(button()).toHaveTextContent('Auto thinking')
    await userEvent.click(button())
    // The heading sits over the options.
    const heading = screen.getByText('Thinking effort')
    expect(heading.compareDocumentPosition(screen.getByRole('listbox'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    const rows = screen.getAllByRole('option').map((option) => {
      // An option's label, then its note, when it has one.
      const [label, detail] = option.querySelectorAll(':scope > span')
      return [
        label?.textContent,
        detail?.textContent ?? null,
        Boolean(option.querySelector('svg[data-pie]')),
      ]
    })
    expect(rows).toEqual([
      ['Auto thinking', 'Each model decides', true],
      ['Off', 'Answers right away', true],
      ['Low', null, true],
      ['Medium', null, true],
      ['High', null, true],
      ['Extra', null, true],
    ])
  })

  it("shows the chosen level's pie and name on the button, and sends its level", async () => {
    const onChange = vi.fn()
    render(<Effort onChange={onChange} />)
    await userEvent.click(button())
    await userEvent.click(screen.getByRole('option', { name: 'High' }))
    expect(onChange).toHaveBeenCalledWith('high')
    expect(button()).toHaveTextContent('High')
    expect(button().querySelector('svg[data-pie] path')).not.toBeNull()
  })
})
