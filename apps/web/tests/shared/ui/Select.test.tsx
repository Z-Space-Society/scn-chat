import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Select, type SelectOption } from '../../../src/shared/ui/Select.tsx'

const options: SelectOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', disabled: true },
  { value: 'c', label: 'Cherry' },
  { value: 'd', label: 'Date' },
]

interface FruitProps {
  onChange?: (value: string) => void
}

function Fruit(props: FruitProps) {
  const [value, setValue] = useState('')
  return (
    <Select
      aria-label="Fruit"
      placeholder="Pick a fruit"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onChange?.(next)
      }}
    />
  )
}

const sizes: SelectOption[] = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
]

/** A fruit, and its size in a submenu. */
function FruitAndSize(props: FruitProps) {
  const [value, setValue] = useState('a')
  const [size, setSize] = useState('m')
  return (
    <Select
      aria-label="Fruit"
      options={options}
      value={value}
      onChange={setValue}
      submenu={{
        label: 'Size',
        options: sizes,
        value: size,
        onChange: (next) => {
          setSize(next)
          props.onChange?.(next)
        },
      }}
    />
  )
}

const box = () => screen.getByRole('combobox', { name: 'Fruit' })
const active = () => box().getAttribute('aria-activedescendant')
const activeName = () => document.getElementById(active() ?? '')?.textContent

describe('Select', () => {
  it('shows its placeholder, then the option picked with the mouse', async () => {
    render(<Fruit />)
    expect(box()).toHaveTextContent('Pick a fruit')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.click(box())
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('option', { name: 'Cherry' }))
    expect(box()).toHaveTextContent('Cherry')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box()).toHaveFocus()
  })

  it('moves with the arrow keys past disabled options, and picks with Enter', async () => {
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    box().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(activeName()).toBe('Apple')
    await userEvent.keyboard('{ArrowDown}')
    expect(activeName()).toBe('Cherry')
    await userEvent.keyboard('{End}{ArrowDown}')
    expect(activeName()).toBe('Date')
    await userEvent.keyboard('{Home}{ArrowUp}')
    expect(activeName()).toBe('Apple')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('a')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not pick a disabled option', async () => {
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    await userEvent.click(box())
    await userEvent.click(screen.getByRole('option', { name: 'Banana' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('closes on Escape without picking, and keeps Escape from the page', async () => {
    const onKeyDown = vi.fn()
    document.addEventListener('keydown', onKeyDown)
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    box().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(onKeyDown.mock.calls.map(([event]) => event.key)).not.toContain('Escape')
    document.removeEventListener('keydown', onKeyDown)
  })

  it('jumps to the option starting with what is typed', async () => {
    render(<Fruit />)
    box().focus()
    await userEvent.keyboard('d')
    expect(activeName()).toBe('Date')
    await userEvent.keyboard('{Enter}')
    expect(box()).toHaveTextContent('Date')
  })

  it('closes when focus leaves it', async () => {
    render(
      <>
        <Fruit />
        <button type="button">Elsewhere</button>
      </>,
    )
    await userEvent.click(box())
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('opens a submenu from its row, which names what is chosen there', async () => {
    const onChange = vi.fn()
    render(<FruitAndSize onChange={onChange} />)
    await userEvent.click(box())
    expect(screen.queryByRole('listbox', { name: 'Size' })).toBeNull()
    expect(screen.getByRole('option', { name: 'SizeMedium' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'SizeMedium' }))
    const submenu = screen.getByRole('listbox', { name: 'Size' })
    expect(activeName()).toBe('Medium')
    await userEvent.click(within(submenu).getByRole('option', { name: 'Large' }))
    expect(onChange).toHaveBeenCalledWith('l')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box()).toHaveTextContent('Apple')
  })

  it('moves into a submenu with the arrow toward it, and back with the one away', async () => {
    const onChange = vi.fn()
    render(<FruitAndSize onChange={onChange} />)
    box().focus()
    await userEvent.keyboard('{ArrowDown}{End}')
    expect(activeName()).toBe('SizeMedium')
    await userEvent.keyboard('{ArrowRight}')
    expect(activeName()).toBe('Medium')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(activeName()).toBe('Large')
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.queryByRole('listbox', { name: 'Size' })).toBeNull()
    expect(activeName()).toBe('SizeMedium')
    await userEvent.keyboard('{Enter}{Home}{Escape}')
    expect(screen.queryByRole('listbox', { name: 'Size' })).toBeNull()
    expect(screen.getByRole('listbox', { name: 'Fruit' })).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}{Home}{Enter}')
    expect(onChange).toHaveBeenCalledWith('s')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
